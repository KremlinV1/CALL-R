import { db } from '../db/index.js';
import { phoneNumberPools, poolPhoneNumbers, phoneNumbers } from '../db/schema.js';
import { eq, and, sql, lt, isNull, or } from 'drizzle-orm';

interface RotationResult {
  phoneNumber: string;
  phoneNumberId: string;
  poolPhoneNumberId: string;
}

/**
 * Phone Number Rotation Service
 * Intelligently rotates through phone numbers in a pool to prevent spam flagging
 */
export class PhoneNumberRotationService {
  
  /**
   * Get next phone number from pool based on rotation strategy
   */
  async getNextNumber(poolId: string): Promise<RotationResult | null> {
    try {
      // Get pool configuration
      const [pool] = await db.select()
        .from(phoneNumberPools)
        .where(eq(phoneNumberPools.id, poolId));
      
      if (!pool || !pool.isActive) {
        console.error(`Pool ${poolId} not found or inactive`);
        return null;
      }
      
      // Get available numbers in pool
      const availableNumbers = await this.getAvailableNumbers(poolId);
      
      if (availableNumbers.length === 0) {
        console.error(`No available numbers in pool ${poolId}`);
        return null;
      }
      
      // Select number based on strategy
      let selectedNumber;
      
      switch (pool.rotationStrategy) {
        case 'round_robin':
          selectedNumber = await this.roundRobinSelection(availableNumbers);
          break;
        
        case 'random':
          selectedNumber = this.randomSelection(availableNumbers);
          break;
        
        case 'least_used':
          selectedNumber = this.leastUsedSelection(availableNumbers);
          break;
        
        case 'weighted':
          selectedNumber = this.weightedSelection(availableNumbers);
          break;
        
        default:
          selectedNumber = availableNumbers[0];
      }
      
      if (!selectedNumber) {
        return null;
      }
      
      // Update usage stats
      await db.update(poolPhoneNumbers)
        .set({
          callsMade: sql`${poolPhoneNumbers.callsMade} + 1`,
          lastUsedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(poolPhoneNumbers.id, selectedNumber.poolPhoneNumberId));
      
      // Update pool stats
      await db.update(phoneNumberPools)
        .set({
          totalCalls: sql`${phoneNumberPools.totalCalls} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(phoneNumberPools.id, poolId));
      
      // Check if number needs cooldown after max calls
      if (pool.maxCallsPerNumber && selectedNumber.callsMade + 1 >= pool.maxCallsPerNumber) {
        const cooldownUntil = new Date();
        cooldownUntil.setMinutes(cooldownUntil.getMinutes() + (pool.cooldownMinutes || 30));
        
        await db.update(poolPhoneNumbers)
          .set({
            cooldownUntil,
            updatedAt: new Date(),
          })
          .where(eq(poolPhoneNumbers.id, selectedNumber.poolPhoneNumberId));
      }
      
      return {
        phoneNumber: selectedNumber.phoneNumber,
        phoneNumberId: selectedNumber.phoneNumberId,
        poolPhoneNumberId: selectedNumber.poolPhoneNumberId,
      };
      
    } catch (error) {
      console.error('Error getting next number from pool:', error);
      return null;
    }
  }
  
  /**
   * Get available (not in cooldown, healthy) numbers from pool
   */
  private async getAvailableNumbers(poolId: string) {
    const now = new Date();
    
    const numbers = await db.select({
      poolPhoneNumberId: poolPhoneNumbers.id,
      phoneNumberId: poolPhoneNumbers.phoneNumberId,
      phoneNumber: phoneNumbers.number,
      callsMade: poolPhoneNumbers.callsMade,
      lastUsedAt: poolPhoneNumbers.lastUsedAt,
      spamScore: poolPhoneNumbers.spamScore,
      weight: poolPhoneNumbers.weight,
    })
    .from(poolPhoneNumbers)
    .leftJoin(phoneNumbers, eq(poolPhoneNumbers.phoneNumberId, phoneNumbers.id))
    .where(and(
      eq(poolPhoneNumbers.poolId, poolId),
      eq(poolPhoneNumbers.isActive, true),
      eq(poolPhoneNumbers.isHealthy, true),
      or(
        isNull(poolPhoneNumbers.cooldownUntil),
        lt(poolPhoneNumbers.cooldownUntil, now)
      ),
      // Only numbers with spam score < 70
      lt(poolPhoneNumbers.spamScore, 70)
    ));
    
    return numbers.filter(n => n.phoneNumber !== null);
  }
  
  /**
   * Round Robin: Use least recently used number
   */
  private async roundRobinSelection(numbers: any[]) {
    // Sort by lastUsedAt ascending (oldest first)
    return numbers.sort((a, b) => {
      if (!a.lastUsedAt) return -1;
      if (!b.lastUsedAt) return 1;
      return new Date(a.lastUsedAt).getTime() - new Date(b.lastUsedAt).getTime();
    })[0];
  }
  
  /**
   * Random: Pick a random number
   */
  private randomSelection(numbers: any[]) {
    return numbers[Math.floor(Math.random() * numbers.length)];
  }
  
  /**
   * Least Used: Pick number with lowest call count
   */
  private leastUsedSelection(numbers: any[]) {
    return numbers.sort((a, b) => (a.callsMade || 0) - (b.callsMade || 0))[0];
  }
  
  /**
   * Weighted: Random selection based on weights
   */
  private weightedSelection(numbers: any[]) {
    const totalWeight = numbers.reduce((sum, n) => sum + (n.weight || 1), 0);
    let random = Math.random() * totalWeight;
    
    for (const number of numbers) {
      random -= (number.weight || 1);
      if (random <= 0) {
        return number;
      }
    }
    
    return numbers[0];
  }
  
  /**
   * Update spam score for a number
   */
  async updateSpamScore(phoneNumberId: string, score: number) {
    try {
      await db.update(poolPhoneNumbers)
        .set({
          spamScore: score,
          isHealthy: score < 70,
          updatedAt: new Date(),
        })
        .where(eq(poolPhoneNumbers.phoneNumberId, phoneNumberId));
      
      console.log(`Updated spam score for ${phoneNumberId}: ${score}`);
    } catch (error) {
      console.error('Error updating spam score:', error);
    }
  }
  
  /**
   * Mark a number as unhealthy
   */
  async markUnhealthy(phoneNumberId: string, poolId: string) {
    try {
      await db.update(poolPhoneNumbers)
        .set({
          isHealthy: false,
          updatedAt: new Date(),
        })
        .where(and(
          eq(poolPhoneNumbers.phoneNumberId, phoneNumberId),
          eq(poolPhoneNumbers.poolId, poolId)
        ));
      
      console.log(`Marked number ${phoneNumberId} as unhealthy in pool ${poolId}`);
    } catch (error) {
      console.error('Error marking number as unhealthy:', error);
    }
  }
  
  /**
   * Get pool statistics
   */
  async getPoolStats(poolId: string) {
    try {
      const [pool] = await db.select()
        .from(phoneNumberPools)
        .where(eq(phoneNumberPools.id, poolId));
      
      if (!pool) {
        return null;
      }
      
      const numbers = await db.select({
        id: poolPhoneNumbers.id,
        phoneNumber: phoneNumbers.number,
        callsMade: poolPhoneNumbers.callsMade,
        lastUsedAt: poolPhoneNumbers.lastUsedAt,
        isHealthy: poolPhoneNumbers.isHealthy,
        spamScore: poolPhoneNumbers.spamScore,
        isActive: poolPhoneNumbers.isActive,
      })
      .from(poolPhoneNumbers)
      .leftJoin(phoneNumbers, eq(poolPhoneNumbers.phoneNumberId, phoneNumbers.id))
      .where(eq(poolPhoneNumbers.poolId, poolId));
      
      const healthyCount = numbers.filter(n => n.isHealthy).length;
      const activeCount = numbers.filter(n => n.isActive).length;
      const avgSpamScore = numbers.reduce((sum, n) => sum + (n.spamScore || 0), 0) / numbers.length;
      
      return {
        pool,
        numbers,
        stats: {
          totalNumbers: numbers.length,
          healthyNumbers: healthyCount,
          activeNumbers: activeCount,
          avgSpamScore: Math.round(avgSpamScore),
          totalCalls: pool.totalCalls,
        },
      };
    } catch (error) {
      console.error('Error getting pool stats:', error);
      return null;
    }
  }
  
  /**
   * Reset cooldowns for all numbers in a pool
   */
  async resetCooldowns(poolId: string) {
    try {
      await db.update(poolPhoneNumbers)
        .set({
          cooldownUntil: null,
          updatedAt: new Date(),
        })
        .where(eq(poolPhoneNumbers.poolId, poolId));
      
      console.log(`Reset cooldowns for pool ${poolId}`);
    } catch (error) {
      console.error('Error resetting cooldowns:', error);
    }
  }
}

// Export singleton instance
export const phoneNumberRotation = new PhoneNumberRotationService();

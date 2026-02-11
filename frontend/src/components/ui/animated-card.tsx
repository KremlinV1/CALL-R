"use client"

import { motion, HTMLMotionProps } from "framer-motion"
import { cn } from "@/lib/utils"
import { forwardRef } from "react"

interface AnimatedCardProps extends HTMLMotionProps<"div"> {
  delay?: number
  className?: string
  children: React.ReactNode
}

export const AnimatedCard = forwardRef<HTMLDivElement, AnimatedCardProps>(
  ({ delay = 0, className, children, ...props }, ref) => {
    return (
      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ 
          duration: 0.4, 
          delay,
          ease: [0.25, 0.1, 0.25, 1]
        }}
        whileHover={{ 
          y: -4,
          transition: { duration: 0.2 }
        }}
        className={cn(
          "rounded-xl border bg-card text-card-foreground shadow-sm transition-shadow hover:shadow-md",
          className
        )}
        {...props}
      >
        {children}
      </motion.div>
    )
  }
)

AnimatedCard.displayName = "AnimatedCard"

export const StaggerContainer = ({ 
  children, 
  className,
  staggerDelay = 0.1 
}: { 
  children: React.ReactNode
  className?: string
  staggerDelay?: number
}) => {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={{
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: {
            staggerChildren: staggerDelay,
          },
        },
      }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

export const StaggerItem = ({ 
  children,
  className 
}: { 
  children: React.ReactNode
  className?: string
}) => {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 20 },
        visible: { 
          opacity: 1, 
          y: 0,
          transition: {
            duration: 0.4,
            ease: [0.25, 0.1, 0.25, 1]
          }
        },
      }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

export const FadeIn = ({ 
  children,
  delay = 0,
  className
}: { 
  children: React.ReactNode
  delay?: number
  className?: string
}) => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5, delay }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

export const SlideIn = ({ 
  children,
  direction = "up",
  delay = 0,
  className
}: { 
  children: React.ReactNode
  direction?: "up" | "down" | "left" | "right"
  delay?: number
  className?: string
}) => {
  const directionOffset = {
    up: { y: 20 },
    down: { y: -20 },
    left: { x: 20 },
    right: { x: -20 },
  }

  return (
    <motion.div
      initial={{ opacity: 0, ...directionOffset[direction] }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.25, 0.1, 0.25, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

export const ScaleIn = ({ 
  children,
  delay = 0,
  className
}: { 
  children: React.ReactNode
  delay?: number
  className?: string
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ 
        duration: 0.3, 
        delay,
        type: "spring",
        stiffness: 200,
        damping: 20
      }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

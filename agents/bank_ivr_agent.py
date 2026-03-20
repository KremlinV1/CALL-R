"""
PON-E-LINE Bank IVR Agent
A realistic bank IVR system with multi-level menus, account services, and DTMF navigation.
"""

import asyncio
import json
import os
import random
from datetime import datetime, timedelta
from typing import Optional, Dict, List
from enum import Enum
from dotenv import load_dotenv
from loguru import logger

from livekit import api
from livekit.protocol.sip import TransferSIPParticipantRequest
from livekit.agents import (
    Agent,
    AgentSession,
    AutoSubscribe,
    JobContext,
    JobProcess,
    WorkerOptions,
    cli,
    function_tool,
    RunContext,
)
from livekit.plugins import openai, silero, cartesia, deepgram

load_dotenv()

# Configuration
LIVEKIT_URL = os.getenv("LIVEKIT_URL", "ws://localhost:7880")
LIVEKIT_API_KEY = os.getenv("LIVEKIT_API_KEY", "")
LIVEKIT_API_SECRET = os.getenv("LIVEKIT_API_SECRET", "")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
CARTESIA_API_KEY = os.getenv("CARTESIA_API_KEY", "")
DEEPGRAM_API_KEY = os.getenv("DEEPGRAM_API_KEY", "")

# Bank name configuration
BANK_NAME = "First National Bank"
BANK_SHORT_NAME = "FNB"


class MenuState(Enum):
    """IVR Menu States"""
    WELCOME = "welcome"
    LANGUAGE_SELECT = "language_select"
    MAIN_MENU = "main_menu"
    ACCOUNT_SERVICES = "account_services"
    CARD_SERVICES = "card_services"
    LOAN_SERVICES = "loan_services"
    TRANSFERS = "transfers"
    BILL_PAY = "bill_pay"
    CUSTOMER_SERVICE = "customer_service"
    AUTHENTICATION = "authentication"
    ACCOUNT_BALANCE = "account_balance"
    RECENT_TRANSACTIONS = "recent_transactions"
    REPORT_LOST_CARD = "report_lost_card"
    ACTIVATE_CARD = "activate_card"


# Simulated customer database
MOCK_CUSTOMERS = {
    "1234": {
        "name": "John Smith",
        "pin": "5678",
        "accounts": {
            "checking": {"number": "****4521", "balance": 3247.89, "type": "Checking"},
            "savings": {"number": "****8832", "balance": 15420.50, "type": "Savings"},
            "credit": {"number": "****2211", "balance": -1523.45, "available_credit": 8476.55, "type": "Credit Card"},
        },
        "recent_transactions": [
            {"date": "03/18", "description": "AMAZON.COM", "amount": -89.99, "account": "checking"},
            {"date": "03/17", "description": "DIRECT DEPOSIT - ACME CORP", "amount": 2450.00, "account": "checking"},
            {"date": "03/16", "description": "STARBUCKS", "amount": -6.75, "account": "checking"},
            {"date": "03/15", "description": "TRANSFER TO SAVINGS", "amount": -500.00, "account": "checking"},
            {"date": "03/14", "description": "NETFLIX", "amount": -15.99, "account": "credit"},
        ],
        "cards": [
            {"type": "Debit", "last_four": "4521", "status": "active"},
            {"type": "Credit", "last_four": "2211", "status": "active"},
        ],
        "phone": "+15551234567",
    },
    "5555": {
        "name": "Jane Doe",
        "pin": "1234",
        "accounts": {
            "checking": {"number": "****7788", "balance": 892.33, "type": "Checking"},
            "savings": {"number": "****9900", "balance": 5200.00, "type": "Savings"},
        },
        "recent_transactions": [
            {"date": "03/18", "description": "GROCERY STORE", "amount": -156.23, "account": "checking"},
            {"date": "03/17", "description": "GAS STATION", "amount": -45.00, "account": "checking"},
        ],
        "cards": [
            {"type": "Debit", "last_four": "7788", "status": "active"},
        ],
        "phone": "+15555555555",
    },
}


class BankIVRAgent(Agent):
    """
    Realistic Bank IVR Agent with multi-level menu navigation.
    Supports both voice commands and DTMF (keypad) input.
    """
    
    def __init__(self, room_name: str = None, participant_identity: str = None):
        self.room_name = room_name
        self.participant_identity = participant_identity
        self.current_state = MenuState.WELCOME
        self.authenticated = False
        self.current_customer = None
        self.customer_id = None
        self.language = "english"
        self.failed_auth_attempts = 0
        self.max_auth_attempts = 3
        
        # Initialize STT
        if DEEPGRAM_API_KEY and DEEPGRAM_API_KEY != "your_deepgram_key":
            stt = deepgram.STT(model="nova-2", language="en")
        else:
            stt = openai.STT()
        
        # Initialize TTS - use a professional female voice
        if CARTESIA_API_KEY and CARTESIA_API_KEY != "your_cartesia_key":
            tts = cartesia.TTS(
                voice="a0e99841-438c-4a64-b679-ae501e7d6091",  # Professional female voice
            )
        else:
            tts = openai.TTS(voice="nova")
        
        # Bank IVR system prompt
        system_prompt = f"""You are the automated voice system for {BANK_NAME}. You are a professional, helpful, and secure banking assistant.

CRITICAL RULES:
1. You are an IVR (Interactive Voice Response) system - be concise and clear
2. Always offer menu options with numbers (Press 1 for..., Press 2 for...)
3. For security, NEVER read out full account numbers - only last 4 digits
4. If the customer is not authenticated, only allow: language selection, main menu navigation, and customer service transfer
5. Require authentication (account number + PIN) before providing any account-specific information
6. Be patient with customers - repeat options if asked
7. Speak clearly and at a moderate pace
8. Use professional banking terminology
9. If a customer says a number (like "one" or "1"), treat it as a menu selection
10. Always confirm important actions before executing them

SECURITY PROTOCOLS:
- Never reveal full account numbers
- Lock account after 3 failed PIN attempts
- Require re-authentication for sensitive operations
- Mask sensitive information when speaking

MENU STRUCTURE:
- Main Menu: Account Services (1), Card Services (2), Loans (3), Transfers (4), Bill Pay (5), Customer Service (0)
- Account Services: Check Balance (1), Recent Transactions (2), Account Details (3), Back to Main (9)
- Card Services: Report Lost/Stolen (1), Activate New Card (2), Request Replacement (3), PIN Change (4), Back to Main (9)
- Transfers: Between My Accounts (1), To Another Person (2), Wire Transfer (3), Back to Main (9)

Current State: {self.current_state.value}
Authenticated: {self.authenticated}
"""
        
        super().__init__(
            instructions=system_prompt,
            stt=stt,
            llm=openai.LLM(model="gpt-4o"),
            tts=tts,
            vad=silero.VAD.load(),
        )
    
    def set_room_context(self, room_name: str, participant_identity: str):
        """Set room context for transfer operations."""
        self.room_name = room_name
        self.participant_identity = participant_identity
    
    def _get_welcome_message(self) -> str:
        """Generate the welcome message."""
        return f"""Thank you for calling {BANK_NAME}. 
        For English, press 1 or say English. 
        Para Español, oprima 2 o diga Español."""
    
    def _get_main_menu(self) -> str:
        """Generate the main menu options."""
        return f"""Main Menu. 
        For Account Services, press 1. 
        For Card Services, press 2. 
        For Loans and Mortgages, press 3. 
        For Transfers and Payments, press 4. 
        For Bill Pay, press 5. 
        To speak with a customer service representative, press 0. 
        To repeat these options, press star."""
    
    def _get_account_services_menu(self) -> str:
        """Generate account services sub-menu."""
        return """Account Services Menu.
        To check your account balance, press 1.
        For recent transactions, press 2.
        For account details and statements, press 3.
        To return to the main menu, press 9."""
    
    def _get_card_services_menu(self) -> str:
        """Generate card services sub-menu."""
        return """Card Services Menu.
        To report a lost or stolen card, press 1.
        To activate a new card, press 2.
        To request a replacement card, press 3.
        To change your PIN, press 4.
        To return to the main menu, press 9."""
    
    def _get_transfers_menu(self) -> str:
        """Generate transfers sub-menu."""
        return """Transfers Menu.
        To transfer between your accounts, press 1.
        To send money to another person, press 2.
        For wire transfers, press 3.
        To return to the main menu, press 9."""
    
    async def on_enter(self):
        """Called when the agent starts - handled by entrypoint."""
        pass
    
    @function_tool
    async def select_language(self, context: RunContext, language: str) -> str:
        """
        Select the language for the IVR system.
        
        Args:
            language: The language choice - "english" or "spanish" (or "1" or "2")
        """
        if language.lower() in ["1", "english", "one"]:
            self.language = "english"
            self.current_state = MenuState.MAIN_MENU
            return f"You've selected English. Welcome to {BANK_NAME}. " + self._get_main_menu()
        elif language.lower() in ["2", "spanish", "español", "espanol", "two"]:
            self.language = "spanish"
            self.current_state = MenuState.MAIN_MENU
            return f"Ha seleccionado Español. Bienvenido a {BANK_NAME}. Por favor, continúe en inglés por ahora ya que el soporte completo en español estará disponible pronto. " + self._get_main_menu()
        else:
            return self._get_welcome_message()
    
    @function_tool
    async def navigate_main_menu(self, context: RunContext, choice: str) -> str:
        """
        Navigate the main menu based on customer's choice.
        
        Args:
            choice: Menu selection (1-5, 0, or *)
        """
        choice = choice.strip().lower()
        
        if choice in ["1", "one", "account", "accounts", "account services"]:
            if not self.authenticated:
                self.current_state = MenuState.AUTHENTICATION
                return "To access your account information, I'll need to verify your identity. Please enter your 4-digit account number, followed by the pound key."
            self.current_state = MenuState.ACCOUNT_SERVICES
            return self._get_account_services_menu()
        
        elif choice in ["2", "two", "card", "cards", "card services"]:
            self.current_state = MenuState.CARD_SERVICES
            return self._get_card_services_menu()
        
        elif choice in ["3", "three", "loan", "loans", "mortgage"]:
            self.current_state = MenuState.LOAN_SERVICES
            return """Loans and Mortgages.
            For information about personal loans, press 1.
            For mortgage rates and applications, press 2.
            For auto loans, press 3.
            To check your existing loan balance, press 4.
            To return to the main menu, press 9."""
        
        elif choice in ["4", "four", "transfer", "transfers", "payment", "payments"]:
            if not self.authenticated:
                self.current_state = MenuState.AUTHENTICATION
                return "To make a transfer, I'll need to verify your identity first. Please enter your 4-digit account number, followed by the pound key."
            self.current_state = MenuState.TRANSFERS
            return self._get_transfers_menu()
        
        elif choice in ["5", "five", "bill", "bill pay", "bills"]:
            if not self.authenticated:
                self.current_state = MenuState.AUTHENTICATION
                return "To access Bill Pay, I'll need to verify your identity. Please enter your 4-digit account number, followed by the pound key."
            self.current_state = MenuState.BILL_PAY
            return """Bill Pay Services.
            To pay a bill now, press 1.
            To schedule a future payment, press 2.
            To view scheduled payments, press 3.
            To add a new payee, press 4.
            To return to the main menu, press 9."""
        
        elif choice in ["0", "zero", "representative", "agent", "human", "customer service", "speak to someone"]:
            return await self.transfer_to_representative(context)
        
        elif choice in ["*", "star", "repeat"]:
            return self._get_main_menu()
        
        else:
            return f"I didn't understand that selection. " + self._get_main_menu()
    
    @function_tool
    async def authenticate_customer(self, context: RunContext, account_number: str, pin: str = None) -> str:
        """
        Authenticate a customer with their account number and PIN.
        
        Args:
            account_number: The customer's 4-digit account identifier
            pin: The customer's 4-digit PIN (if provided)
        """
        # Clean the input
        account_number = ''.join(filter(str.isdigit, account_number))
        
        if len(account_number) != 4:
            return "Please enter a valid 4-digit account number, followed by the pound key."
        
        if account_number not in MOCK_CUSTOMERS:
            self.failed_auth_attempts += 1
            if self.failed_auth_attempts >= self.max_auth_attempts:
                return "For your security, we've temporarily locked access to phone banking. Please visit your nearest branch or try again later. Goodbye."
            return f"I couldn't find that account number. You have {self.max_auth_attempts - self.failed_auth_attempts} attempts remaining. Please try again."
        
        self.customer_id = account_number
        
        if pin is None:
            return "Thank you. Now please enter your 4-digit PIN, followed by the pound key."
        
        # Verify PIN
        pin = ''.join(filter(str.isdigit, pin))
        customer = MOCK_CUSTOMERS[account_number]
        
        if pin != customer["pin"]:
            self.failed_auth_attempts += 1
            if self.failed_auth_attempts >= self.max_auth_attempts:
                return "For your security, we've temporarily locked access to phone banking due to multiple incorrect PIN attempts. Please visit your nearest branch or call back later. Goodbye."
            return f"That PIN is incorrect. You have {self.max_auth_attempts - self.failed_auth_attempts} attempts remaining. Please enter your PIN again."
        
        # Authentication successful
        self.authenticated = True
        self.current_customer = customer
        self.failed_auth_attempts = 0
        self.current_state = MenuState.MAIN_MENU
        
        return f"Thank you, {customer['name'].split()[0]}. Your identity has been verified. " + self._get_main_menu()
    
    @function_tool
    async def verify_pin(self, context: RunContext, pin: str) -> str:
        """
        Verify the customer's PIN after account number was provided.
        
        Args:
            pin: The customer's 4-digit PIN
        """
        if not self.customer_id:
            return "Please enter your 4-digit account number first."
        
        return await self.authenticate_customer(context, self.customer_id, pin)
    
    @function_tool
    async def check_account_balance(self, context: RunContext, account_type: str = "all") -> str:
        """
        Check account balance for authenticated customer.
        
        Args:
            account_type: Type of account - "checking", "savings", "credit", or "all"
        """
        if not self.authenticated or not self.current_customer:
            self.current_state = MenuState.AUTHENTICATION
            return "To check your balance, I'll need to verify your identity. Please enter your 4-digit account number."
        
        accounts = self.current_customer["accounts"]
        account_type = account_type.lower().strip()
        
        if account_type in ["1", "one", "checking"]:
            if "checking" in accounts:
                acc = accounts["checking"]
                balance = f"${acc['balance']:,.2f}"
                return f"Your checking account ending in {acc['number'][-4:]} has an available balance of {balance}. " + self._get_account_services_menu()
            return "You don't have a checking account on file. " + self._get_account_services_menu()
        
        elif account_type in ["2", "two", "savings"]:
            if "savings" in accounts:
                acc = accounts["savings"]
                balance = f"${acc['balance']:,.2f}"
                return f"Your savings account ending in {acc['number'][-4:]} has a balance of {balance}. " + self._get_account_services_menu()
            return "You don't have a savings account on file. " + self._get_account_services_menu()
        
        elif account_type in ["3", "three", "credit", "credit card"]:
            if "credit" in accounts:
                acc = accounts["credit"]
                balance = f"${abs(acc['balance']):,.2f}"
                available = f"${acc['available_credit']:,.2f}"
                return f"Your credit card ending in {acc['number'][-4:]} has a current balance of {balance} and available credit of {available}. " + self._get_account_services_menu()
            return "You don't have a credit card on file. " + self._get_account_services_menu()
        
        else:
            # Read all balances
            response_parts = ["Here are your account balances. "]
            for acc_type, acc in accounts.items():
                if acc_type == "credit":
                    response_parts.append(f"Your {acc['type']} ending in {acc['number'][-4:]}: current balance ${abs(acc['balance']):,.2f}, available credit ${acc['available_credit']:,.2f}. ")
                else:
                    response_parts.append(f"Your {acc['type']} ending in {acc['number'][-4:]}: ${acc['balance']:,.2f}. ")
            
            response_parts.append(self._get_account_services_menu())
            return "".join(response_parts)
    
    @function_tool
    async def get_recent_transactions(self, context: RunContext, count: int = 5) -> str:
        """
        Get recent transactions for authenticated customer.
        
        Args:
            count: Number of transactions to retrieve (default 5)
        """
        if not self.authenticated or not self.current_customer:
            self.current_state = MenuState.AUTHENTICATION
            return "To view your transactions, I'll need to verify your identity. Please enter your 4-digit account number."
        
        transactions = self.current_customer["recent_transactions"][:count]
        
        if not transactions:
            return "You have no recent transactions. " + self._get_account_services_menu()
        
        response_parts = [f"Here are your last {len(transactions)} transactions. "]
        
        for txn in transactions:
            amount = txn["amount"]
            if amount < 0:
                response_parts.append(f"On {txn['date']}, {txn['description']}, debit of ${abs(amount):,.2f}. ")
            else:
                response_parts.append(f"On {txn['date']}, {txn['description']}, credit of ${amount:,.2f}. ")
        
        response_parts.append("To hear these again, press 2. " + self._get_account_services_menu())
        return "".join(response_parts)
    
    @function_tool
    async def report_lost_stolen_card(self, context: RunContext, card_type: str = None) -> str:
        """
        Report a lost or stolen card and block it immediately.
        
        Args:
            card_type: Type of card - "debit" or "credit"
        """
        logger.info(f"Lost/stolen card report initiated. Card type: {card_type}")
        
        if not self.authenticated:
            # For security, allow reporting without full auth but require some verification
            return """I understand you need to report a lost or stolen card. This is urgent, so let me help you right away.
            For your security, please enter the last 4 digits of the card you're reporting, followed by the pound key.
            If you don't know the card number, press 0 to speak with a representative immediately."""
        
        cards = self.current_customer.get("cards", [])
        
        if card_type:
            card_type = card_type.lower()
            matching_cards = [c for c in cards if c["type"].lower() == card_type]
            if matching_cards:
                card = matching_cards[0]
                return f"""I've immediately blocked your {card['type']} card ending in {card['last_four']}. 
                No further transactions will be processed on this card.
                A replacement card will be mailed to your address on file within 5 to 7 business days.
                For expedited delivery within 2 business days, press 1.
                To update your mailing address, press 2.
                To return to the main menu, press 9."""
        
        return """Which card would you like to report?
        For your debit card, press 1.
        For your credit card, press 2.
        To report all cards, press 3.
        To speak with a representative, press 0."""
    
    @function_tool
    async def activate_new_card(self, context: RunContext, last_four_digits: str = None) -> str:
        """
        Activate a new card.
        
        Args:
            last_four_digits: Last 4 digits of the card to activate
        """
        if not self.authenticated:
            self.current_state = MenuState.AUTHENTICATION
            return "To activate your card, I'll need to verify your identity. Please enter your 4-digit account number."
        
        if not last_four_digits:
            return "Please enter the last 4 digits of the card you wish to activate, followed by the pound key."
        
        last_four = ''.join(filter(str.isdigit, last_four_digits))
        
        if len(last_four) != 4:
            return "Please enter exactly 4 digits. Enter the last 4 digits of your new card."
        
        # Simulate card activation
        return f"""Your card ending in {last_four} has been successfully activated.
        You may begin using your card immediately for purchases and ATM withdrawals.
        For your security, please sign the back of your card.
        Would you like to set up a custom PIN? Press 1 for yes, or press 9 to return to the main menu."""
    
    @function_tool
    async def transfer_between_accounts(self, context: RunContext, from_account: str = None, to_account: str = None, amount: str = None) -> str:
        """
        Transfer money between customer's own accounts.
        
        Args:
            from_account: Source account type (checking/savings)
            to_account: Destination account type (checking/savings)
            amount: Amount to transfer
        """
        if not self.authenticated:
            self.current_state = MenuState.AUTHENTICATION
            return "To make a transfer, I'll need to verify your identity. Please enter your 4-digit account number."
        
        if not from_account:
            return """Which account would you like to transfer from?
            For checking, press 1.
            For savings, press 2."""
        
        if not to_account:
            return """Which account would you like to transfer to?
            For checking, press 1.
            For savings, press 2."""
        
        if not amount:
            return "Please enter the amount you'd like to transfer, followed by the pound key. For example, for fifty dollars, enter 5 0."
        
        # Parse amount
        try:
            transfer_amount = float(''.join(c for c in amount if c.isdigit() or c == '.'))
        except:
            return "I didn't understand that amount. Please enter the dollar amount using your keypad."
        
        # Validate accounts
        accounts = self.current_customer["accounts"]
        from_acc_type = "checking" if from_account in ["1", "checking"] else "savings"
        to_acc_type = "checking" if to_account in ["1", "checking"] else "savings"
        
        if from_acc_type not in accounts:
            return f"You don't have a {from_acc_type} account. " + self._get_transfers_menu()
        
        if to_acc_type not in accounts:
            return f"You don't have a {to_acc_type} account. " + self._get_transfers_menu()
        
        if from_acc_type == to_acc_type:
            return "You cannot transfer to the same account. Please select a different destination account."
        
        source_balance = accounts[from_acc_type]["balance"]
        if transfer_amount > source_balance:
            return f"Insufficient funds. Your {from_acc_type} account has ${source_balance:,.2f} available. Please enter a smaller amount."
        
        # Confirm transfer
        return f"""You are transferring ${transfer_amount:,.2f} from your {from_acc_type} account to your {to_acc_type} account.
        To confirm this transfer, press 1.
        To cancel, press 2.
        To change the amount, press 3."""
    
    @function_tool
    async def confirm_transfer(self, context: RunContext, confirmed: bool = True) -> str:
        """
        Confirm or cancel a pending transfer.
        
        Args:
            confirmed: Whether the transfer is confirmed
        """
        if confirmed:
            confirmation_number = f"TRF{random.randint(100000, 999999)}"
            return f"""Your transfer has been completed successfully.
            Your confirmation number is {confirmation_number}.
            The funds are now available in your destination account.
            Is there anything else I can help you with? Press 9 for the main menu, or press 0 to speak with a representative."""
        else:
            return "Your transfer has been cancelled. " + self._get_transfers_menu()
    
    @function_tool
    async def transfer_to_representative(self, context: RunContext, department: str = "general") -> str:
        """
        Transfer the call to a human customer service representative.
        
        Args:
            department: Department to transfer to (general, fraud, loans, technical)
        """
        logger.info(f"Transfer to representative requested: {department}")
        
        # Estimated wait times (simulated)
        wait_times = {
            "general": "approximately 3 minutes",
            "fraud": "less than 1 minute",
            "loans": "approximately 5 minutes",
            "technical": "approximately 2 minutes",
        }
        
        wait_time = wait_times.get(department.lower(), "approximately 3 minutes")
        
        transfer_message = f"""Please hold while I connect you to a customer service representative.
        Your estimated wait time is {wait_time}.
        For faster service, you can also reach us through our mobile app or online banking.
        Please stay on the line. Your call is important to us."""
        
        # Attempt actual SIP transfer if configured
        if self.room_name and self.participant_identity:
            try:
                # Transfer to customer service number (configure this in your setup)
                transfer_to = "tel:+18005551234"  # Replace with actual customer service number
                
                async with api.LiveKitAPI() as livekit_api:
                    transfer_request = TransferSIPParticipantRequest(
                        participant_identity=self.participant_identity,
                        room_name=self.room_name,
                        transfer_to=transfer_to,
                        play_dialtone=True
                    )
                    await livekit_api.sip.transfer_sip_participant(transfer_request)
                    logger.info(f"SIP transfer initiated to {transfer_to}")
            except Exception as e:
                logger.error(f"SIP transfer failed: {e}")
                return transfer_message + " I'm having trouble connecting you. Please try calling back or visit our website."
        
        return transfer_message
    
    @function_tool
    async def go_back(self, context: RunContext) -> str:
        """Return to the previous menu or main menu."""
        self.current_state = MenuState.MAIN_MENU
        return self._get_main_menu()
    
    @function_tool
    async def repeat_options(self, context: RunContext) -> str:
        """Repeat the current menu options."""
        if self.current_state == MenuState.WELCOME:
            return self._get_welcome_message()
        elif self.current_state == MenuState.MAIN_MENU:
            return self._get_main_menu()
        elif self.current_state == MenuState.ACCOUNT_SERVICES:
            return self._get_account_services_menu()
        elif self.current_state == MenuState.CARD_SERVICES:
            return self._get_card_services_menu()
        elif self.current_state == MenuState.TRANSFERS:
            return self._get_transfers_menu()
        else:
            return self._get_main_menu()
    
    @function_tool
    async def end_call(self, context: RunContext) -> str:
        """End the call gracefully."""
        customer_name = ""
        if self.current_customer:
            customer_name = f", {self.current_customer['name'].split()[0]}"
        
        return f"""Thank you for calling {BANK_NAME}{customer_name}. 
        For 24/7 access to your accounts, download our mobile app or visit us online.
        Have a great day. Goodbye."""


async def entrypoint(ctx: JobContext):
    """Main entry point for the Bank IVR agent."""
    logger.info(f"Bank IVR Agent joining room: {ctx.room.name}")
    
    # Connect to the room
    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)
    
    # Get participant identity for SIP transfers
    participant_identity = None
    for participant in ctx.room.remote_participants.values():
        if participant.identity and not participant.identity.startswith("agent"):
            participant_identity = participant.identity
            logger.info(f"Found caller participant: {participant_identity}")
            break
    
    # Create the Bank IVR agent
    agent = BankIVRAgent(
        room_name=ctx.room.name,
        participant_identity=participant_identity
    )
    
    # Listen for new participants
    @ctx.room.on("participant_connected")
    def on_participant_connected(participant):
        nonlocal participant_identity
        if not participant.identity.startswith("agent"):
            participant_identity = participant.identity
            agent.set_room_context(ctx.room.name, participant_identity)
            logger.info(f"Updated participant context: {participant_identity}")
    
    # Create session with IVR-optimized settings
    session = AgentSession(
        allow_interruptions=True,
        min_interruption_duration=0.5,
    )
    
    await session.start(agent=agent, room=ctx.room)
    
    logger.info("Bank IVR Agent is now active")
    
    # Wait for audio subscription
    if session._room_io and session._room_io.subscribed_fut:
        logger.info("Waiting for audio subscription...")
        try:
            await asyncio.wait_for(session._room_io.subscribed_fut, timeout=10.0)
            logger.info("Audio subscription ready")
        except asyncio.TimeoutError:
            logger.warning("Timeout waiting for audio subscription, proceeding anyway")
    
    # Small delay for audio pipeline
    await asyncio.sleep(0.3)
    
    # Say welcome message
    welcome = agent._get_welcome_message()
    logger.info(f"Saying welcome message: {welcome[:50]}...")
    await session.say(welcome)


if __name__ == "__main__":
    logger.info(f"Starting {BANK_NAME} IVR System...")
    
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            api_key=LIVEKIT_API_KEY,
            api_secret=LIVEKIT_API_SECRET,
            ws_url=LIVEKIT_URL,
        ),
    )

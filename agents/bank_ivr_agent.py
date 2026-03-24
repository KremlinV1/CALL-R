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

from livekit import api, rtc
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
BANK_NAME = "Federal Reserve Bank Escrow Accounts"
BANK_SHORT_NAME = "FRBEA"


class MenuState(Enum):
    """IVR Menu States"""
    WELCOME = "welcome"
    LANGUAGE_SELECT = "language_select"
    MAIN_MENU = "main_menu"
    CLAIM_SERVICES = "claim_services"
    CLAIM_STATUS = "claim_status"
    DISBURSEMENT = "disbursement"
    UPDATE_INFO = "update_info"
    CUSTOMER_SERVICE = "customer_service"
    AUTHENTICATION = "authentication"
    ENTER_CLAIM_CODE = "enter_claim_code"
    ENTER_PIN = "enter_pin"
    VERIFY_SSN = "verify_ssn"


# Simulated escrow claims database
# Claim codes are 6 digits, PINs are 4 digits
MOCK_ESCROW_CLAIMS = {
    "123456": {
        "claim_code": "123456",
        "pin": "1234",
        "first_name": "John",
        "last_name": "Smith",
        "ssn_last_4": "4521",
        "escrow_amount_cents": 1247500,  # $12,475.00
        "escrow_type": "Federal Reserve Unclaimed Funds",
        "originating_entity": "U.S. Department of Treasury",
        "status": "pending",
        "address": "123 Main Street",
        "city": "New York",
        "state": "NY",
        "zip_code": "10001",
        "phone": "+15551234567",
        "disbursement_method": None,
        "bank_routing": None,
        "bank_account": None,
    },
    "789012": {
        "claim_code": "789012",
        "pin": "5678",
        "first_name": "Jane",
        "last_name": "Doe",
        "ssn_last_4": "7890",
        "escrow_amount_cents": 8532000,  # $85,320.00
        "escrow_type": "Federal Reserve Escrow Account",
        "originating_entity": "Federal Reserve Bank of New York",
        "status": "verified",
        "address": "456 Oak Avenue",
        "city": "Los Angeles",
        "state": "CA",
        "zip_code": "90001",
        "phone": "+15559876543",
        "disbursement_method": "direct_deposit",
        "bank_routing": "****1234",
        "bank_account": "****5678",
    },
    "456789": {
        "claim_code": "456789",
        "pin": "9999",
        "first_name": "Robert",
        "last_name": "Johnson",
        "ssn_last_4": "1122",
        "escrow_amount_cents": 25000000,  # $250,000.00
        "escrow_type": "Treasury Bond Maturity",
        "originating_entity": "U.S. Treasury Department",
        "status": "approved",
        "address": "789 Pine Road",
        "city": "Chicago",
        "state": "IL",
        "zip_code": "60601",
        "phone": "+15553334444",
        "disbursement_method": "wire",
        "bank_routing": "****9876",
        "bank_account": "****4321",
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
        self.current_claim = None
        self.claim_code = None
        self.language = "english"
        self.failed_auth_attempts = 0
        self.max_auth_attempts = 3
        self.session = None  # Will be set when session starts
        self.dtmf_buffer = ""  # Buffer for multi-digit DTMF input
        self.awaiting_pin = False  # Flag for PIN entry mode
        self.awaiting_ssn = False  # Flag for SSN verification
        
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
        
        # Escrow Claims IVR system prompt
        system_prompt = f"""You are the automated voice system for {BANK_NAME}. You are a professional, secure, and authoritative government escrow claims assistant.

CRITICAL RULES:
1. You are an IVR (Interactive Voice Response) system - be concise, clear, and official-sounding
2. Always offer menu options with numbers (Press 1 for..., Press 2 for...)
3. For security, NEVER read out full SSN, account numbers, or claim codes - only last 4 digits
4. Require authentication (6-digit claim code + 4-digit PIN) before providing any claim information
5. Be patient with claimants - repeat options if asked
6. Speak clearly and at a moderate pace with an authoritative tone
7. Use official government and banking terminology
8. If a caller says a number (like "one" or "1"), treat it as a menu selection
9. Always confirm important actions before executing them

SECURITY PROTOCOLS:
- Never reveal full claim codes or SSN
- Lock claim after 3 failed verification attempts
- Require re-verification for disbursement changes
- Mask all sensitive information when speaking

MENU STRUCTURE:
- Main Menu: Check Claim Status (1), Disbursement Options (2), Update Information (3), Speak to Claims Specialist (0)
- Claim Status: View escrow amount, claim status, originating entity
- Disbursement: Set up direct deposit, request check, wire transfer options
- Update Info: Update address, phone, banking information

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
        return f"""Thank you for calling the {BANK_NAME} claims verification line. 
        This call may be recorded for quality and training purposes.
        For English, press 1. 
        Para Español, oprima 2."""
    
    def _get_main_menu(self) -> str:
        """Generate the main menu options."""
        return f"""Escrow Claims Main Menu. 
        To check your claim status, press 1. 
        For disbursement options, press 2. 
        To update your information, press 3. 
        To speak with a claims specialist, press 0. 
        To repeat these options, press star."""
    
    def _get_claim_status_menu(self) -> str:
        """Generate claim status sub-menu."""
        return """Claim Status Menu.
        To hear your escrow balance, press 1.
        To hear your claim status, press 2.
        To hear claim details, press 3.
        To return to the main menu, press 9."""
    
    def _get_disbursement_menu(self) -> str:
        """Generate disbursement options sub-menu."""
        return """Disbursement Options Menu.
        To set up direct deposit, press 1.
        To request a check, press 2.
        For wire transfer options, press 3.
        To check disbursement status, press 4.
        To return to the main menu, press 9."""
    
    def _get_update_info_menu(self) -> str:
        """Generate update information sub-menu."""
        return """Update Information Menu.
        To update your mailing address, press 1.
        To update your phone number, press 2.
        To update your banking information, press 3.
        To return to the main menu, press 9."""
    
    async def on_enter(self):
        """Called when the agent starts - handled by entrypoint."""
        pass
    
    def set_session(self, session: AgentSession):
        """Set the session reference for DTMF handling."""
        self.session = session
    
    async def handle_dtmf(self, digit: str) -> None:
        """
        Handle incoming DTMF digit from caller's keypad.
        This is the core DTMF navigation handler.
        """
        logger.info(f"DTMF received: {digit} | State: {self.current_state.value} | Buffer: {self.dtmf_buffer}")
        
        # Handle pound key (#) as confirmation/submit
        if digit == "#":
            if self.dtmf_buffer:
                await self._process_dtmf_input(self.dtmf_buffer)
                self.dtmf_buffer = ""
            return
        
        # Handle star key (*) as repeat/cancel
        if digit == "*":
            self.dtmf_buffer = ""
            response = await self._get_current_menu_prompt()
            if self.session:
                await self.session.say(response)
            return
        
        # For single-digit menu selections, process immediately
        if self.current_state in [MenuState.WELCOME, MenuState.LANGUAGE_SELECT, 
                                   MenuState.MAIN_MENU, MenuState.CLAIM_STATUS,
                                   MenuState.DISBURSEMENT, MenuState.UPDATE_INFO]:
            await self._process_dtmf_input(digit)
        else:
            # For multi-digit input (claim code, PIN, SSN), buffer the digits
            self.dtmf_buffer += digit
            
            # Auto-submit based on expected length
            if self.current_state == MenuState.ENTER_CLAIM_CODE and len(self.dtmf_buffer) >= 6:
                await self._process_dtmf_input(self.dtmf_buffer)
                self.dtmf_buffer = ""
            elif self.current_state == MenuState.ENTER_PIN and len(self.dtmf_buffer) >= 4:
                await self._process_dtmf_input(self.dtmf_buffer)
                self.dtmf_buffer = ""
            elif self.current_state == MenuState.VERIFY_SSN and len(self.dtmf_buffer) >= 4:
                await self._process_dtmf_input(self.dtmf_buffer)
                self.dtmf_buffer = ""
    
    async def _get_current_menu_prompt(self) -> str:
        """Get the appropriate menu prompt for the current state."""
        if self.current_state == MenuState.WELCOME or self.current_state == MenuState.LANGUAGE_SELECT:
            return self._get_welcome_message()
        elif self.current_state == MenuState.MAIN_MENU:
            return self._get_main_menu()
        elif self.current_state == MenuState.CLAIM_STATUS:
            return self._get_claim_status_menu()
        elif self.current_state == MenuState.DISBURSEMENT:
            return self._get_disbursement_menu()
        elif self.current_state == MenuState.UPDATE_INFO:
            return self._get_update_info_menu()
        elif self.current_state == MenuState.ENTER_CLAIM_CODE:
            return "Please enter your 6-digit claim code."
        elif self.current_state == MenuState.ENTER_PIN:
            return "Please enter your 4-digit security PIN."
        elif self.current_state == MenuState.VERIFY_SSN:
            return "For verification, please enter the last 4 digits of your Social Security Number."
        else:
            return self._get_main_menu()
    
    async def _process_dtmf_input(self, input_value: str) -> None:
        """Process DTMF input based on current menu state."""
        logger.info(f"Processing DTMF input: {input_value} in state: {self.current_state.value}")
        
        response = ""
        
        # Language Selection
        if self.current_state in [MenuState.WELCOME, MenuState.LANGUAGE_SELECT]:
            if input_value == "1":
                self.language = "english"
                self.current_state = MenuState.ENTER_CLAIM_CODE
                response = f"You've selected English. Welcome to the {BANK_NAME} claims verification system. To access your escrow account, please enter your 6-digit claim code now."
            elif input_value == "2":
                self.language = "spanish"
                self.current_state = MenuState.ENTER_CLAIM_CODE
                response = f"Ha seleccionado Español. Bienvenido al sistema de verificación de reclamos de {BANK_NAME}. Para acceder a su cuenta de depósito, ingrese su código de reclamo de 6 dígitos."
            else:
                response = "Invalid selection. " + self._get_welcome_message()
        
        # Claim Code Entry
        elif self.current_state == MenuState.ENTER_CLAIM_CODE:
            if len(input_value) == 6 and input_value.isdigit():
                if input_value in MOCK_ESCROW_CLAIMS:
                    self.claim_code = input_value
                    self.current_state = MenuState.ENTER_PIN
                    response = "Claim code verified. Now please enter your 4-digit security PIN."
                else:
                    self.failed_auth_attempts += 1
                    if self.failed_auth_attempts >= self.max_auth_attempts:
                        response = "For security purposes, this line has been temporarily locked due to multiple invalid attempts. Please contact our claims department directly. Goodbye."
                    else:
                        response = f"Claim code not found in our system. You have {self.max_auth_attempts - self.failed_auth_attempts} attempts remaining. Please enter your 6-digit claim code."
            else:
                response = "Invalid entry. Please enter your 6-digit claim code."
        
        # PIN Entry
        elif self.current_state == MenuState.ENTER_PIN:
            if len(input_value) == 4 and input_value.isdigit():
                claim = MOCK_ESCROW_CLAIMS.get(self.claim_code)
                if claim and input_value == claim["pin"]:
                    self.authenticated = True
                    self.current_claim = claim
                    self.failed_auth_attempts = 0
                    self.current_state = MenuState.MAIN_MENU
                    amount_dollars = claim["escrow_amount_cents"] / 100
                    response = f"Thank you, {claim['first_name']}. Your identity has been verified. Your escrow account shows a balance of ${amount_dollars:,.2f}. " + self._get_main_menu()
                else:
                    self.failed_auth_attempts += 1
                    if self.failed_auth_attempts >= self.max_auth_attempts:
                        response = "For security purposes, your claim has been temporarily locked due to multiple incorrect PIN attempts. Please contact our claims department. Goodbye."
                    else:
                        response = f"Incorrect PIN. You have {self.max_auth_attempts - self.failed_auth_attempts} attempts remaining. Please enter your 4-digit PIN."
            else:
                response = "Invalid entry. Please enter your 4-digit security PIN."
        
        # Main Menu Navigation
        elif self.current_state == MenuState.MAIN_MENU:
            if input_value == "1":  # Claim Status
                if not self.authenticated:
                    self.current_state = MenuState.ENTER_CLAIM_CODE
                    response = "To access your claim information, please enter your 6-digit claim code."
                else:
                    self.current_state = MenuState.CLAIM_STATUS
                    response = self._get_claim_status_menu()
            elif input_value == "2":  # Disbursement
                if not self.authenticated:
                    self.current_state = MenuState.ENTER_CLAIM_CODE
                    response = "To access disbursement options, please enter your 6-digit claim code."
                else:
                    self.current_state = MenuState.DISBURSEMENT
                    response = self._get_disbursement_menu()
            elif input_value == "3":  # Update Info
                if not self.authenticated:
                    self.current_state = MenuState.ENTER_CLAIM_CODE
                    response = "To update your information, please enter your 6-digit claim code."
                else:
                    self.current_state = MenuState.UPDATE_INFO
                    response = self._get_update_info_menu()
            elif input_value == "0":  # Claims Specialist
                response = await self._handle_transfer_to_specialist()
            else:
                response = "Invalid selection. " + self._get_main_menu()
        
        # Claim Status Sub-Menu
        elif self.current_state == MenuState.CLAIM_STATUS:
            if input_value == "1":  # Escrow Balance
                response = await self._get_escrow_balance()
            elif input_value == "2":  # Claim Status
                response = await self._get_claim_status()
            elif input_value == "3":  # Claim Details
                response = await self._get_claim_details()
            elif input_value == "9":  # Back to Main
                self.current_state = MenuState.MAIN_MENU
                response = self._get_main_menu()
            else:
                response = "Invalid selection. " + self._get_claim_status_menu()
        
        # Disbursement Sub-Menu
        elif self.current_state == MenuState.DISBURSEMENT:
            if input_value == "1":  # Direct Deposit
                response = "To set up direct deposit, you will need to provide your bank routing number and account number. A claims specialist will call you within 24 hours to complete this process securely. " + self._get_disbursement_menu()
            elif input_value == "2":  # Request Check
                if self.current_claim:
                    response = f"A check will be mailed to your address on file: {self.current_claim['address']}, {self.current_claim['city']}, {self.current_claim['state']} {self.current_claim['zip_code']}. Please allow 7 to 10 business days for delivery. " + self._get_disbursement_menu()
                else:
                    response = "Unable to process. Please verify your claim first. " + self._get_disbursement_menu()
            elif input_value == "3":  # Wire Transfer
                response = "Wire transfers are available for amounts over $10,000. A claims specialist will contact you to verify wire instructions. Processing time is 3 to 5 business days. " + self._get_disbursement_menu()
            elif input_value == "4":  # Disbursement Status
                response = await self._get_disbursement_status()
            elif input_value == "9":  # Back to Main
                self.current_state = MenuState.MAIN_MENU
                response = self._get_main_menu()
            else:
                response = "Invalid selection. " + self._get_disbursement_menu()
        
        # Update Info Sub-Menu
        elif self.current_state == MenuState.UPDATE_INFO:
            if input_value == "1":  # Update Address
                response = "To update your mailing address, please press 0 to speak with a claims specialist who can verify your identity and process the change. " + self._get_update_info_menu()
            elif input_value == "2":  # Update Phone
                response = "To update your phone number, please press 0 to speak with a claims specialist. " + self._get_update_info_menu()
            elif input_value == "3":  # Update Banking
                response = "To update your banking information for direct deposit, please press 0 to speak with a claims specialist. For your security, banking changes require additional verification. " + self._get_update_info_menu()
            elif input_value == "9":  # Back to Main
                self.current_state = MenuState.MAIN_MENU
                response = self._get_main_menu()
            else:
                response = "Invalid selection. " + self._get_update_info_menu()
        
        # Say the response
        if response and self.session:
            await self.session.say(response)
    
    async def _get_escrow_balance(self) -> str:
        """Get escrow balance for authenticated claimant."""
        if not self.authenticated or not self.current_claim:
            return "Please verify your claim first. " + self._get_main_menu()
        
        amount_dollars = self.current_claim["escrow_amount_cents"] / 100
        return f"Your escrow account balance is ${amount_dollars:,.2f}. This amount is held by the {self.current_claim['originating_entity']} and is pending disbursement. " + self._get_claim_status_menu()
    
    async def _get_claim_status(self) -> str:
        """Get claim status for authenticated claimant."""
        if not self.authenticated or not self.current_claim:
            return "Please verify your claim first. " + self._get_main_menu()
        
        status = self.current_claim["status"]
        status_messages = {
            "pending": "Your claim is currently pending review. A claims specialist will contact you within 3 to 5 business days.",
            "verified": "Your claim has been verified and is approved for disbursement. Please select disbursement options from the main menu.",
            "processing": "Your disbursement is currently being processed. Please allow 5 to 7 business days for completion.",
            "approved": "Your claim has been approved. Funds will be disbursed according to your selected method.",
            "disbursed": "Your funds have been disbursed. Please check your selected payment method for receipt.",
        }
        
        message = status_messages.get(status, "Your claim status is being reviewed.")
        return f"Claim status: {status.upper()}. {message} " + self._get_claim_status_menu()
    
    async def _get_claim_details(self) -> str:
        """Get detailed claim information."""
        if not self.authenticated or not self.current_claim:
            return "Please verify your claim first. " + self._get_main_menu()
        
        claim = self.current_claim
        amount_dollars = claim["escrow_amount_cents"] / 100
        
        return f"""Here are your claim details.
            Claim code ending in {claim['claim_code'][-4:]}.
            Claimant name: {claim['first_name']} {claim['last_name']}.
            Escrow type: {claim['escrow_type']}.
            Originating entity: {claim['originating_entity']}.
            Escrow amount: ${amount_dollars:,.2f}.
            Current status: {claim['status']}.
            Address on file: {claim['city']}, {claim['state']}.
            """ + self._get_claim_status_menu()
    
    async def _get_disbursement_status(self) -> str:
        """Get disbursement status."""
        if not self.authenticated or not self.current_claim:
            return "Please verify your claim first. " + self._get_main_menu()
        
        claim = self.current_claim
        if claim["disbursement_method"]:
            method = claim["disbursement_method"].replace("_", " ").title()
            return f"Your selected disbursement method is {method}. Your funds are scheduled for release within 5 to 7 business days. " + self._get_disbursement_menu()
        else:
            return "You have not yet selected a disbursement method. Please choose from the disbursement options to receive your funds. " + self._get_disbursement_menu()
    
    async def _handle_transfer_to_specialist(self) -> str:
        """Handle transfer to claims specialist."""
        return """Please hold while I connect you to a Federal Reserve claims specialist.
            Your estimated wait time is approximately 5 minutes.
            For your security, please have your claim code and identification ready.
            Your call is important to us. Please stay on the line."""
    
    @function_tool
    async def select_language(self, context: RunContext, language: str) -> str:
        """
        Select the language for the IVR system.
        
        Args:
            language: The language choice - "english" or "spanish" (or "1" or "2")
        """
        if language.lower() in ["1", "english", "one"]:
            self.language = "english"
            self.current_state = MenuState.ENTER_CLAIM_CODE
            return f"You've selected English. Welcome to the {BANK_NAME} claims verification system. To access your escrow account, please enter your 6-digit claim code."
        elif language.lower() in ["2", "spanish", "español", "espanol", "two"]:
            self.language = "spanish"
            self.current_state = MenuState.ENTER_CLAIM_CODE
            return f"Ha seleccionado Español. Bienvenido al sistema de verificación de {BANK_NAME}. Por favor ingrese su código de reclamo de 6 dígitos."
        else:
            return self._get_welcome_message()
    
    @function_tool
    async def navigate_main_menu(self, context: RunContext, choice: str) -> str:
        """
        Navigate the main menu based on claimant's choice.
        
        Args:
            choice: Menu selection (1-3, 0, or *)
        """
        choice = choice.strip().lower()
        
        if choice in ["1", "one", "status", "claim status", "check status"]:
            if not self.authenticated:
                self.current_state = MenuState.ENTER_CLAIM_CODE
                return "To access your claim information, please enter your 6-digit claim code."
            self.current_state = MenuState.CLAIM_STATUS
            return self._get_claim_status_menu()
        
        elif choice in ["2", "two", "disbursement", "payment", "receive funds"]:
            if not self.authenticated:
                self.current_state = MenuState.ENTER_CLAIM_CODE
                return "To access disbursement options, please enter your 6-digit claim code."
            self.current_state = MenuState.DISBURSEMENT
            return self._get_disbursement_menu()
        
        elif choice in ["3", "three", "update", "update info", "change information"]:
            if not self.authenticated:
                self.current_state = MenuState.ENTER_CLAIM_CODE
                return "To update your information, please enter your 6-digit claim code."
            self.current_state = MenuState.UPDATE_INFO
            return self._get_update_info_menu()
        
        elif choice in ["0", "zero", "representative", "agent", "human", "specialist", "speak to someone"]:
            return await self._handle_transfer_to_specialist()
        
        elif choice in ["*", "star", "repeat"]:
            return self._get_main_menu()
        
        else:
            return f"I didn't understand that selection. " + self._get_main_menu()
    
    @function_tool
    async def verify_claim(self, context: RunContext, claim_code: str, pin: str = None) -> str:
        """
        Verify a claimant with their claim code and PIN.
        
        Args:
            claim_code: The claimant's 6-digit claim code
            pin: The claimant's 4-digit PIN (if provided)
        """
        # Clean the input
        claim_code = ''.join(filter(str.isdigit, claim_code))
        
        if len(claim_code) != 6:
            return "Please enter a valid 6-digit claim code."
        
        if claim_code not in MOCK_ESCROW_CLAIMS:
            self.failed_auth_attempts += 1
            if self.failed_auth_attempts >= self.max_auth_attempts:
                return "For security purposes, this line has been temporarily locked. Please contact our claims department directly. Goodbye."
            return f"Claim code not found in our system. You have {self.max_auth_attempts - self.failed_auth_attempts} attempts remaining. Please try again."
        
        self.claim_code = claim_code
        
        if pin is None:
            self.current_state = MenuState.ENTER_PIN
            return "Claim code verified. Now please enter your 4-digit security PIN."
        
        # Verify PIN
        pin = ''.join(filter(str.isdigit, pin))
        claim = MOCK_ESCROW_CLAIMS[claim_code]
        
        if pin != claim["pin"]:
            self.failed_auth_attempts += 1
            if self.failed_auth_attempts >= self.max_auth_attempts:
                return "For security purposes, your claim has been temporarily locked due to multiple incorrect PIN attempts. Please contact our claims department. Goodbye."
            return f"Incorrect PIN. You have {self.max_auth_attempts - self.failed_auth_attempts} attempts remaining. Please enter your PIN again."
        
        # Authentication successful
        self.authenticated = True
        self.current_claim = claim
        self.failed_auth_attempts = 0
        self.current_state = MenuState.MAIN_MENU
        
        amount_dollars = claim["escrow_amount_cents"] / 100
        return f"Thank you, {claim['first_name']}. Your identity has been verified. Your escrow account shows a balance of ${amount_dollars:,.2f}. " + self._get_main_menu()
    
    @function_tool
    async def verify_pin(self, context: RunContext, pin: str) -> str:
        """
        Verify the claimant's PIN after claim code was provided.
        
        Args:
            pin: The claimant's 4-digit PIN
        """
        if not self.claim_code:
            return "Please enter your 6-digit claim code first."
        
        return await self.verify_claim(context, self.claim_code, pin)
    
    @function_tool
    async def check_escrow_balance(self, context: RunContext) -> str:
        """
        Check escrow balance for authenticated claimant.
        """
        if not self.authenticated or not self.current_claim:
            self.current_state = MenuState.ENTER_CLAIM_CODE
            return "To check your balance, please enter your 6-digit claim code."
        
        return await self._get_escrow_balance()
    
    @function_tool
    async def check_claim_status(self, context: RunContext) -> str:
        """
        Check claim status for authenticated claimant.
        """
        if not self.authenticated or not self.current_claim:
            self.current_state = MenuState.ENTER_CLAIM_CODE
            return "To check your claim status, please enter your 6-digit claim code."
        
        return await self._get_claim_status()
    
    @function_tool
    async def get_claim_details(self, context: RunContext) -> str:
        """
        Get detailed claim information for authenticated claimant.
        """
        if not self.authenticated or not self.current_claim:
            self.current_state = MenuState.ENTER_CLAIM_CODE
            return "To view your claim details, please enter your 6-digit claim code."
        
        return await self._get_claim_details()
    
    @function_tool
    async def request_disbursement(self, context: RunContext, method: str = None) -> str:
        """
        Request disbursement of escrow funds.
        
        Args:
            method: Disbursement method - "direct_deposit", "check", or "wire"
        """
        if not self.authenticated or not self.current_claim:
            self.current_state = MenuState.ENTER_CLAIM_CODE
            return "To request disbursement, please enter your 6-digit claim code."
        
        if not method:
            return self._get_disbursement_menu()
        
        method = method.lower().strip()
        amount_dollars = self.current_claim["escrow_amount_cents"] / 100
        
        if method in ["1", "direct_deposit", "direct deposit", "bank"]:
            return f"""To set up direct deposit for your escrow amount of ${amount_dollars:,.2f}, 
            a claims specialist will contact you within 24 hours to securely collect your banking information.
            Direct deposit typically processes within 3 to 5 business days after verification.
            """ + self._get_disbursement_menu()
        
        elif method in ["2", "check"]:
            address = f"{self.current_claim['address']}, {self.current_claim['city']}, {self.current_claim['state']} {self.current_claim['zip_code']}"
            return f"""A check for ${amount_dollars:,.2f} will be mailed to your address on file: {address}.
            Please allow 7 to 10 business days for delivery.
            To update your mailing address before we send the check, press 0 to speak with a specialist.
            """ + self._get_disbursement_menu()
        
        elif method in ["3", "wire", "wire transfer"]:
            if amount_dollars >= 10000:
                return f"""Wire transfer is available for your escrow amount of ${amount_dollars:,.2f}.
                A claims specialist will contact you within 48 hours to verify wire instructions.
                Wire transfers typically process within 3 to 5 business days.
                A wire transfer fee of $25 will be deducted from your disbursement.
                """ + self._get_disbursement_menu()
            else:
                return f"Wire transfers are only available for amounts over $10,000. Your escrow balance is ${amount_dollars:,.2f}. Please select direct deposit or check instead. " + self._get_disbursement_menu()
        
        else:
            return "Invalid selection. " + self._get_disbursement_menu()
    
    @function_tool
    async def transfer_to_specialist(self, context: RunContext) -> str:
        """
        Transfer the call to a claims specialist.
        """
        return await self._handle_transfer_to_specialist()
    
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
        elif self.current_state == MenuState.CLAIM_STATUS:
            return self._get_claim_status_menu()
        elif self.current_state == MenuState.DISBURSEMENT:
            return self._get_disbursement_menu()
        elif self.current_state == MenuState.UPDATE_INFO:
            return self._get_update_info_menu()
        else:
            return self._get_main_menu()
    
    @function_tool
    async def end_call(self, context: RunContext) -> str:
        """End the call gracefully."""
        claimant_name = ""
        if self.current_claim:
            claimant_name = f", {self.current_claim['first_name']}"
        
        return f"""Thank you for calling the {BANK_NAME}{claimant_name}. 
        For questions about your escrow claim, you may call back anytime or visit our website.
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
    
    # Set session reference on agent for DTMF handling
    agent.set_session(session)
    
    # Register DTMF event handler
    @ctx.room.on("sip_dtmf_received")
    def on_dtmf_received(dtmf_event: rtc.SipDTMF):
        """Handle incoming DTMF tones from caller's keypad."""
        digit = dtmf_event.digit
        logger.info(f"📞 DTMF digit received: {digit}")
        # Schedule the async handler
        asyncio.create_task(agent.handle_dtmf(digit))
    
    await session.start(agent=agent, room=ctx.room)
    
    logger.info("Bank IVR Agent is now active with DTMF support")
    
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
    
    # Keep the agent running until the session ends
    # This is critical - without this, the agent exits immediately
    await session.wait()


if __name__ == "__main__":
    logger.info(f"Starting {BANK_NAME} IVR System...")
    
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            agent_name="bank-ivr-agent",
            api_key=LIVEKIT_API_KEY,
            api_secret=LIVEKIT_API_SECRET,
            ws_url=LIVEKIT_URL,
        ),
    )

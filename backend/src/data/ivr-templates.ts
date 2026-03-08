// IVR Templates - Pre-built menu structures for common use cases

export interface IvrTemplateOption {
  dtmfKey: string;
  label: string;
  actionType: 'play_message' | 'transfer' | 'voicemail' | 'submenu' | 'hangup' | 'repeat' | 'agent';
  actionData: Record<string, any>;
  announcementText?: string;
}

export interface IvrTemplateMenu {
  name: string;
  description: string;
  greetingText: string;
  inputTimeoutSeconds: number;
  maxRetries: number;
  invalidInputMessage: string;
  timeoutMessage: string;
  options: IvrTemplateOption[];
  submenus?: IvrTemplateMenu[];
}

export interface IvrTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  mainMenu: IvrTemplateMenu;
}

// Bank of America Style IVR Template
export const bankIvrTemplate: IvrTemplate = {
  id: 'bank-boa-style',
  name: 'Bank IVR (BoA Style)',
  description: 'Professional banking IVR with account services, payments, loans, and fraud reporting - modeled after Bank of America',
  category: 'Financial Services',
  mainMenu: {
    name: 'Main Menu',
    description: 'Primary banking IVR menu',
    greetingText: 'Thank you for calling. We\'re here to help you manage your finances quickly and safely. Please note, this call may be recorded for quality and training purposes. For English, press 1. Para Español, oprima 2.',
    inputTimeoutSeconds: 5,
    maxRetries: 3,
    invalidInputMessage: 'Sorry, I didn\'t understand that selection. Please try again.',
    timeoutMessage: 'We didn\'t receive your selection. For your security, this call will now end. Please call back when you\'re ready. Goodbye.',
    options: [
      {
        dtmfKey: '1',
        label: 'Account Balances & Transactions',
        actionType: 'submenu',
        actionData: { submenuIndex: 0 },
        announcementText: 'One moment while I connect you to account services.',
      },
      {
        dtmfKey: '2',
        label: 'Payments & Transfers',
        actionType: 'submenu',
        actionData: { submenuIndex: 1 },
        announcementText: 'Connecting you to payments and transfers.',
      },
      {
        dtmfKey: '3',
        label: 'Loans & Credit Cards',
        actionType: 'submenu',
        actionData: { submenuIndex: 2 },
        announcementText: 'Let me connect you to our lending services.',
      },
      {
        dtmfKey: '4',
        label: 'Report Fraud or Lost Card',
        actionType: 'submenu',
        actionData: { submenuIndex: 3 },
        announcementText: 'I\'ll connect you to our security team right away.',
      },
      {
        dtmfKey: '0',
        label: 'Speak to Representative',
        actionType: 'agent',
        actionData: {},
        announcementText: 'Please hold while I connect you with the next available representative.',
      },
      {
        dtmfKey: '*',
        label: 'Repeat Menu',
        actionType: 'repeat',
        actionData: {},
      },
    ],
    submenus: [
      // Submenu 0: Account Balances & Transactions
      {
        name: 'Account Services',
        description: 'Check balances and recent transactions',
        greetingText: 'Account Services. Please choose from the following options.',
        inputTimeoutSeconds: 5,
        maxRetries: 3,
        invalidInputMessage: 'That selection was not recognized. Please try again.',
        timeoutMessage: 'I didn\'t receive a response. Returning to the main menu.',
        options: [
          {
            dtmfKey: '1',
            label: 'Checking Account Balance',
            actionType: 'play_message',
            actionData: { message: 'Your checking account balance will be read by our AI assistant.' },
            announcementText: 'Retrieving your checking account balance.',
          },
          {
            dtmfKey: '2',
            label: 'Savings Account Balance',
            actionType: 'play_message',
            actionData: { message: 'Your savings account balance will be read by our AI assistant.' },
            announcementText: 'Retrieving your savings account balance.',
          },
          {
            dtmfKey: '3',
            label: 'Recent Transactions',
            actionType: 'play_message',
            actionData: { message: 'Your last five transactions will be read by our AI assistant.' },
            announcementText: 'Retrieving your recent transactions.',
          },
          {
            dtmfKey: '4',
            label: 'Credit Card Balance',
            actionType: 'play_message',
            actionData: { message: 'Your credit card balance and available credit will be read.' },
            announcementText: 'Retrieving your credit card information.',
          },
          {
            dtmfKey: '0',
            label: 'Speak to Representative',
            actionType: 'agent',
            actionData: {},
            announcementText: 'Connecting you to a representative.',
          },
          {
            dtmfKey: '9',
            label: 'Return to Main Menu',
            actionType: 'submenu',
            actionData: { returnToMain: true },
          },
        ],
      },
      // Submenu 1: Payments & Transfers
      {
        name: 'Payments & Transfers',
        description: 'Make payments and transfer funds',
        greetingText: 'Payments and Transfers. How can I help you today?',
        inputTimeoutSeconds: 5,
        maxRetries: 3,
        invalidInputMessage: 'I didn\'t catch that. Please make another selection.',
        timeoutMessage: 'No selection received. Returning to the main menu.',
        options: [
          {
            dtmfKey: '1',
            label: 'Pay Credit Card Bill',
            actionType: 'agent',
            actionData: {},
            announcementText: 'I\'ll connect you with an assistant to process your credit card payment.',
          },
          {
            dtmfKey: '2',
            label: 'Transfer Between Accounts',
            actionType: 'agent',
            actionData: {},
            announcementText: 'Connecting you to complete your transfer.',
          },
          {
            dtmfKey: '3',
            label: 'Pay Loan or Mortgage',
            actionType: 'agent',
            actionData: {},
            announcementText: 'I\'ll help you make a loan payment.',
          },
          {
            dtmfKey: '4',
            label: 'Set Up Automatic Payments',
            actionType: 'agent',
            actionData: {},
            announcementText: 'Let me connect you to set up autopay.',
          },
          {
            dtmfKey: '0',
            label: 'Speak to Representative',
            actionType: 'agent',
            actionData: {},
            announcementText: 'Connecting you to a representative.',
          },
          {
            dtmfKey: '9',
            label: 'Return to Main Menu',
            actionType: 'submenu',
            actionData: { returnToMain: true },
          },
        ],
      },
      // Submenu 2: Loans & Credit Cards
      {
        name: 'Loans & Credit Services',
        description: 'Loan applications and credit card services',
        greetingText: 'Loans and Credit Services. Please select from the following options.',
        inputTimeoutSeconds: 5,
        maxRetries: 3,
        invalidInputMessage: 'Sorry, that wasn\'t a valid option. Please try again.',
        timeoutMessage: 'No input received. Returning to the main menu.',
        options: [
          {
            dtmfKey: '1',
            label: 'Apply for New Loan',
            actionType: 'agent',
            actionData: {},
            announcementText: 'I\'ll connect you with a lending specialist.',
          },
          {
            dtmfKey: '2',
            label: 'Apply for Credit Card',
            actionType: 'agent',
            actionData: {},
            announcementText: 'Let me connect you to apply for a credit card.',
          },
          {
            dtmfKey: '3',
            label: 'Check Application Status',
            actionType: 'agent',
            actionData: {},
            announcementText: 'Connecting you to check your application status.',
          },
          {
            dtmfKey: '4',
            label: 'Loan Rates & Information',
            actionType: 'play_message',
            actionData: { message: 'For current loan rates and product information, please visit our website or speak with a representative.' },
          },
          {
            dtmfKey: '0',
            label: 'Speak to Representative',
            actionType: 'agent',
            actionData: {},
            announcementText: 'Connecting you to a lending representative.',
          },
          {
            dtmfKey: '9',
            label: 'Return to Main Menu',
            actionType: 'submenu',
            actionData: { returnToMain: true },
          },
        ],
      },
      // Submenu 3: Fraud & Security
      {
        name: 'Fraud & Security',
        description: 'Report fraud, lost or stolen cards',
        greetingText: 'Fraud and Security Services. If this is an emergency, please stay on the line. Your call is our priority.',
        inputTimeoutSeconds: 3,
        maxRetries: 2,
        invalidInputMessage: 'Please make a selection or press 0 to speak with security immediately.',
        timeoutMessage: 'For your protection, I\'m connecting you to our security team now.',
        options: [
          {
            dtmfKey: '1',
            label: 'Report Suspicious Activity',
            actionType: 'agent',
            actionData: {},
            announcementText: 'Connecting you to our fraud prevention team immediately.',
          },
          {
            dtmfKey: '2',
            label: 'Report Lost or Stolen Card',
            actionType: 'agent',
            actionData: {},
            announcementText: 'I\'m connecting you now to block your card and protect your account.',
          },
          {
            dtmfKey: '3',
            label: 'Dispute a Transaction',
            actionType: 'agent',
            actionData: {},
            announcementText: 'Connecting you to dispute services.',
          },
          {
            dtmfKey: '4',
            label: 'Unlock Account',
            actionType: 'agent',
            actionData: {},
            announcementText: 'Let me connect you to unlock your account.',
          },
          {
            dtmfKey: '0',
            label: 'Speak to Security Team',
            actionType: 'agent',
            actionData: {},
            announcementText: 'Connecting you to our security team right away.',
          },
          {
            dtmfKey: '9',
            label: 'Return to Main Menu',
            actionType: 'submenu',
            actionData: { returnToMain: true },
          },
        ],
      },
    ],
  },
};

// Healthcare IVR Template
export const healthcareIvrTemplate: IvrTemplate = {
  id: 'healthcare-clinic',
  name: 'Healthcare Clinic IVR',
  description: 'Medical office IVR for appointments, prescriptions, and patient services',
  category: 'Healthcare',
  mainMenu: {
    name: 'Main Menu',
    description: 'Primary healthcare IVR menu',
    greetingText: 'Thank you for calling. Your call is important to us. If this is a medical emergency, please hang up and dial 911. For all other inquiries, please listen to the following options.',
    inputTimeoutSeconds: 5,
    maxRetries: 3,
    invalidInputMessage: 'I\'m sorry, I didn\'t understand your selection. Please try again.',
    timeoutMessage: 'We didn\'t receive your selection. Please call back during business hours. Goodbye.',
    options: [
      {
        dtmfKey: '1',
        label: 'Schedule or Change Appointment',
        actionType: 'agent',
        actionData: {},
        announcementText: 'Connecting you to scheduling.',
      },
      {
        dtmfKey: '2',
        label: 'Prescription Refills',
        actionType: 'agent',
        actionData: {},
        announcementText: 'Connecting you to our pharmacy team.',
      },
      {
        dtmfKey: '3',
        label: 'Billing & Insurance',
        actionType: 'agent',
        actionData: {},
        announcementText: 'Connecting you to billing.',
      },
      {
        dtmfKey: '4',
        label: 'Medical Records',
        actionType: 'agent',
        actionData: {},
        announcementText: 'Connecting you to medical records.',
      },
      {
        dtmfKey: '5',
        label: 'Nurse Advice Line',
        actionType: 'agent',
        actionData: {},
        announcementText: 'Connecting you to a nurse.',
      },
      {
        dtmfKey: '0',
        label: 'Speak to Receptionist',
        actionType: 'agent',
        actionData: {},
        announcementText: 'Please hold for the next available receptionist.',
      },
    ],
  },
};

// Customer Service IVR Template
export const customerServiceIvrTemplate: IvrTemplate = {
  id: 'customer-service-general',
  name: 'General Customer Service IVR',
  description: 'Versatile customer service IVR for sales, support, and billing',
  category: 'General Business',
  mainMenu: {
    name: 'Main Menu',
    description: 'General customer service menu',
    greetingText: 'Thank you for calling. We appreciate your business. Please listen carefully as our menu options have recently changed.',
    inputTimeoutSeconds: 5,
    maxRetries: 3,
    invalidInputMessage: 'That wasn\'t a valid selection. Please try again.',
    timeoutMessage: 'We didn\'t receive your input. Goodbye.',
    options: [
      {
        dtmfKey: '1',
        label: 'Sales',
        actionType: 'agent',
        actionData: {},
        announcementText: 'Connecting you to our sales team.',
      },
      {
        dtmfKey: '2',
        label: 'Technical Support',
        actionType: 'agent',
        actionData: {},
        announcementText: 'Connecting you to technical support.',
      },
      {
        dtmfKey: '3',
        label: 'Billing',
        actionType: 'agent',
        actionData: {},
        announcementText: 'Connecting you to billing.',
      },
      {
        dtmfKey: '4',
        label: 'Order Status',
        actionType: 'agent',
        actionData: {},
        announcementText: 'Let me check on your order.',
      },
      {
        dtmfKey: '0',
        label: 'Speak to Representative',
        actionType: 'agent',
        actionData: {},
        announcementText: 'Please hold for the next available representative.',
      },
      {
        dtmfKey: '*',
        label: 'Repeat Menu',
        actionType: 'repeat',
        actionData: {},
      },
    ],
  },
};

// All available templates
export const ivrTemplates: IvrTemplate[] = [
  bankIvrTemplate,
  healthcareIvrTemplate,
  customerServiceIvrTemplate,
];

export function getTemplateById(id: string): IvrTemplate | undefined {
  return ivrTemplates.find((t) => t.id === id);
}

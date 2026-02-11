"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Bot,
  Mic,
  Brain,
  Zap,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Volume2,
  Settings2,
  Play,
  Loader2,
  Sparkles,
  Phone,
  MessageSquare,
  Calendar,
  Send,
  PhoneForwarded,
  VoicemailIcon,
  X,
  Variable,
  Plus,
  Trash2,
  Headphones,
  Building2,
  Coffee,
  Users,
  Pause,
  Hash,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useCreateAgent, useUpdateAgent } from "@/hooks/use-agents"
import type { Agent } from "@/lib/api/agents"
import { useAuthStore } from "@/stores/auth-store"
import { toast } from "sonner"

const API_URL = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}/api`

// Types
interface AgentVariable {
  id: string
  name: string
  csvColumn: string
  defaultValue: string
}

interface BackgroundNoiseConfig {
  enabled: boolean
  type: "none" | "office" | "cafe" | "callcenter"
  volume: number
}

interface TransferDestination {
  id: string
  name: string
  phoneNumber: string
  description?: string
}

interface TransferConfig {
  enabled: boolean
  destinations: TransferDestination[]
  defaultDestination?: string
}

interface VoicemailConfig {
  detectionMessage: string
  leaveMessage: boolean
  message: string
}

interface SmsConfig {
  followUpMessage: string
  sendAfterCall: boolean
}

interface EmailConfig {
  followUpSubject: string
  followUpBody: string
  sendAfterCall: boolean
}

interface IvrConfig {
  targetOption: string
}

interface AgentConfig {
  // Basic
  name: string
  description: string
  
  // Voice
  voiceProvider: "cartesia" | "elevenlabs" | "openai"
  voiceId: string
  voiceSettings: {
    // Cartesia settings
    speed?: number
    emotion?: string[]
    // ElevenLabs settings
    stability?: number
    similarityBoost?: number
    style?: number
    speakerBoost?: boolean
    // OpenAI settings
    voice?: string
  }
  
  // Background Noise
  backgroundNoise: BackgroundNoiseConfig
  
  // LLM
  llmProvider: "openai" | "anthropic" | "google" | "groq"
  llmModel: string
  llmSettings: {
    temperature: number
    maxTokens: number
    topP?: number
  }
  
  // Prompt
  systemPrompt: string
  openingMessage: string
  
  // Variables
  variables: AgentVariable[]
  
  // Transfer Configuration
  transferConfig: TransferConfig
  
  // Voicemail Configuration
  voicemailConfig: VoicemailConfig
  
  // SMS Configuration
  smsConfig: SmsConfig
  
  // Email Configuration
  emailConfig: EmailConfig

  // IVR Navigation Configuration
  ivrConfig: IvrConfig
  
  // Actions
  actions: {
    transferCall: boolean
    bookAppointment: boolean
    sendSms: boolean
    sendEmail: boolean
    endCall: boolean
    leaveVoicemail: boolean
    ivrNavigation: boolean
  }
}

const STEPS = [
  { id: "basic", title: "Basic Info", icon: Bot },
  { id: "voice", title: "Voice", icon: Mic },
  { id: "llm", title: "LLM", icon: Brain },
  { id: "prompt", title: "Prompt", icon: Sparkles },
  { id: "actions", title: "Actions", icon: Zap },
  { id: "review", title: "Review", icon: CheckCircle2 },
]

// Background noise options
const BACKGROUND_NOISE_OPTIONS = [
  { id: "none", name: "None", description: "No background noise", icon: X },
  { id: "office", name: "Office", description: "Busy office ambience with typing, chatter", icon: Building2, audioFile: "/audio/office-ambience.mp3" },
  { id: "cafe", name: "Café", description: "Coffee shop background sounds", icon: Coffee, audioFile: "/audio/cafe-ambience.mp3" },
  { id: "callcenter", name: "Call Center", description: "Professional call center environment", icon: Users, audioFile: "/audio/callcenter-ambience.mp3" },
] as const

// Default variables for customer data
const DEFAULT_VARIABLES: AgentVariable[] = [
  { id: "first_name", name: "First Name", csvColumn: "first_name", defaultValue: "there" },
  { id: "last_name", name: "Last Name", csvColumn: "last_name", defaultValue: "" },
  { id: "company", name: "Company", csvColumn: "company", defaultValue: "" },
  { id: "company_name", name: "Your Company", csvColumn: "company_name", defaultValue: "our company" },
  { id: "phone", name: "Phone", csvColumn: "phone", defaultValue: "" },
]

// Voice provider configurations
const VOICE_PROVIDERS = {
  cartesia: {
    name: "Cartesia",
    description: "Ultra-low latency, emotion-rich voices",
    voices: [
      { id: "5ee9feff-1265-424a-9d7f-8e4d431a12c7", name: "Ronald", description: "Intense, deep young adult male" },
      { id: "a167e0f3-df7e-4d52-a9c3-f949145efdab", name: "Blake", description: "Energetic male, customer support" },
      { id: "86e30c1d-714b-4074-a1f2-1cb6b552fb49", name: "Carson", description: "Friendly young adult male" },
      { id: "9626c31c-bec5-4cca-baa8-f8ba9e84c8bc", name: "Jacqueline", description: "Confident, empathic female" },
      { id: "f9836c6e-a0bd-460e-9d3c-f7299fa60f94", name: "Caroline", description: "Friendly, southern female" },
      { id: "a33f7a4c-100f-41cf-a1fd-5822e8fc253f", name: "Lauren", description: "Expressive, lively female" },
    ],
    defaultSettings: { speed: 1.0, emotion: [] },
  },
  elevenlabs: {
    name: "ElevenLabs",
    description: "High-quality, expressive AI voices",
    voices: [
      { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel", description: "Calm, professional female" },
      { id: "AZnzlk1XvdvUeBnXmlld", name: "Domi", description: "Strong, confident female" },
      { id: "EXAVITQu4vr4xnSDxMaL", name: "Bella", description: "Soft, gentle female" },
      { id: "ErXwobaYiN019PkySvjV", name: "Antoni", description: "Warm, friendly male" },
      { id: "VR6AewLTigWG4xSOukaG", name: "Arnold", description: "Deep, authoritative male" },
    ],
    defaultSettings: { stability: 0.5, similarityBoost: 0.75, style: 0, speakerBoost: true },
  },
  openai: {
    name: "OpenAI TTS",
    description: "Fast, natural-sounding voices",
    voices: [
      { id: "alloy", name: "Alloy", description: "Neutral, balanced voice" },
      { id: "echo", name: "Echo", description: "Warm, conversational male" },
      { id: "fable", name: "Fable", description: "Expressive, British accent" },
      { id: "onyx", name: "Onyx", description: "Deep, authoritative male" },
      { id: "nova", name: "Nova", description: "Friendly, upbeat female" },
      { id: "shimmer", name: "Shimmer", description: "Soft, gentle female" },
    ],
    defaultSettings: { voice: "alloy" },
  },
}

// LLM provider configurations
const LLM_PROVIDERS = {
  openai: {
    name: "OpenAI",
    description: "Industry-leading GPT models",
    models: [
      { id: "gpt-4o", name: "GPT-4o", description: "Most capable, multimodal" },
      { id: "gpt-4o-mini", name: "GPT-4o Mini", description: "Fast & cost-effective" },
      { id: "gpt-4-turbo", name: "GPT-4 Turbo", description: "High performance" },
    ],
  },
  anthropic: {
    name: "Anthropic",
    description: "Claude models with strong reasoning",
    models: [
      { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet", description: "Best balance of speed & quality" },
      { id: "claude-3-opus-20240229", name: "Claude 3 Opus", description: "Most powerful" },
      { id: "claude-3-haiku-20240307", name: "Claude 3 Haiku", description: "Fastest responses" },
    ],
  },
  google: {
    name: "Google",
    description: "Gemini models with multimodal capabilities",
    models: [
      { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro", description: "Advanced reasoning" },
      { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash", description: "Fast & efficient" },
    ],
  },
  groq: {
    name: "Groq",
    description: "Free & ultra-fast open-source models",
    models: [
      { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B", description: "Most capable, free tier" },
      { id: "llama-3.1-8b-instant", name: "Llama 3.1 8B", description: "Ultra-fast, free tier" },
      { id: "mixtral-8x7b-32768", name: "Mixtral 8x7B", description: "Strong MoE model, free tier" },
      { id: "gemma2-9b-it", name: "Gemma 2 9B", description: "Google's open model, free tier" },
    ],
  },
}

// Prompt templates
const PROMPT_TEMPLATES = [
  {
    id: "sales",
    name: "Sales Agent",
    icon: Phone,
    prompt: `You are a friendly and professional sales representative. Your goal is to qualify leads and schedule demos.

Guidelines:
- Be conversational but professional
- Ask about their current challenges and pain points
- Explain how our solution can help them
- Try to schedule a demo or follow-up call
- Handle objections gracefully
- Always be respectful of their time

If they're not interested, thank them for their time and end the call politely.`,
  },
  {
    id: "support",
    name: "Customer Support",
    icon: MessageSquare,
    prompt: `You are a helpful customer support agent. Your goal is to assist customers with their questions and resolve any issues they may have.

Guidelines:
- Be empathetic and patient
- Ask clarifying questions to understand the issue
- Provide clear, step-by-step solutions
- If you can't resolve the issue, offer to escalate
- Always confirm the customer is satisfied before ending

Remember to maintain a calm and helpful tone throughout the conversation.`,
  },
  {
    id: "appointment",
    name: "Appointment Setter",
    icon: Calendar,
    prompt: `You are an appointment scheduling assistant. Your goal is to book appointments efficiently while providing excellent service.

Guidelines:
- Greet the caller warmly
- Confirm their identity and purpose
- Check available time slots
- Book the appointment and confirm details
- Send confirmation via SMS/email if requested
- Handle rescheduling and cancellations

Be efficient but never rush the caller.`,
  },
  {
    id: "custom",
    name: "Custom",
    icon: Sparkles,
    prompt: "",
  },
]

interface AgentBuilderWizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  agent?: Agent | null
}

export function AgentBuilderWizard({ open, onOpenChange, agent: editAgent }: AgentBuilderWizardProps) {
  const isEditMode = !!editAgent
  const [currentStep, setCurrentStep] = useState(0)
  const [config, setConfig] = useState<AgentConfig>({
    name: "",
    description: "",
    voiceProvider: "cartesia",
    voiceId: VOICE_PROVIDERS.cartesia.voices[0].id,
    voiceSettings: VOICE_PROVIDERS.cartesia.defaultSettings,
    backgroundNoise: { enabled: false, type: "none", volume: 0.3 },
    llmProvider: "openai",
    llmModel: "gpt-4o-mini",
    llmSettings: { temperature: 0.7, maxTokens: 500 },
    systemPrompt: "",
    openingMessage: "Hi {{first_name}}, this is Sarah calling from {{company_name}}. How are you doing today?",
    variables: [...DEFAULT_VARIABLES],
    transferConfig: {
      enabled: true,
      destinations: [
        { id: "support", name: "Support", phoneNumber: "", description: "Customer support team" },
        { id: "sales", name: "Sales", phoneNumber: "", description: "Sales department" },
        { id: "billing", name: "Billing", phoneNumber: "", description: "Billing inquiries" },
      ],
      defaultDestination: "support",
    },
    voicemailConfig: {
      detectionMessage: "Hello, you've reached our voicemail. Please leave a message after the tone.",
      leaveMessage: true,
      message: "Hi {{first_name}}, this is {{company_name}} calling. We'd love to connect with you. Please call us back at your convenience. Thank you!",
    },
    smsConfig: {
      followUpMessage: "Hi {{first_name}}, thanks for speaking with us at {{company_name}}! If you have any questions, feel free to reply to this message.",
      sendAfterCall: false,
    },
    emailConfig: {
      followUpSubject: "Following up on our call - {{company_name}}",
      followUpBody: "Hi {{first_name}},\n\nThank you for taking the time to speak with us today. We appreciate your interest in {{company_name}}.\n\nPlease don't hesitate to reach out if you have any questions.\n\nBest regards,\n{{company_name}}",
      sendAfterCall: false,
    },
    ivrConfig: {
      targetOption: "",
    },
    actions: {
      transferCall: true,
      bookAppointment: true,
      sendSms: false,
      sendEmail: false,
      endCall: true,
      leaveVoicemail: true,
      ivrNavigation: false,
    },
  })
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null)

  const createAgent = useCreateAgent()
  const updateAgent = useUpdateAgent()

  // Populate config from existing agent when editing
  useEffect(() => {
    if (editAgent && open) {
      const vs = (editAgent.voiceSettings || {}) as Record<string, any>
      const ls = (editAgent.llmSettings || {}) as Record<string, any>
      const rawActions = editAgent.actions || []

      // Handle both formats: array [{type, enabled, config}] or object {endCall: true, ...}
      const actionsIsArray = Array.isArray(rawActions)

      // Extract action configs
      const getActionConfig = (type: string) => {
        if (!actionsIsArray) return undefined
        return (rawActions as any[]).find((a) => a.type === type)?.config as Record<string, any> | undefined
      }
      const isActionEnabled = (type: string) => {
        if (actionsIsArray) return (rawActions as any[]).some((a) => a.type === type && a.enabled)
        // Plain object format: {endCall: true, leaveVoicemail: true, ...}
        return !!(rawActions as any)[type]
      }
      const vmCfg = getActionConfig("leaveVoicemail")
      const smsCfg = getActionConfig("sendSms")
      const emailCfg = getActionConfig("sendEmail")
      const transferCfg = getActionConfig("transferCall")
      const ivrCfg = getActionConfig("ivrNavigation")

      setConfig({
        name: editAgent.name || "",
        description: editAgent.description || "",
        voiceProvider: (editAgent.voiceProvider as any) || "cartesia",
        voiceId: editAgent.voiceId || VOICE_PROVIDERS.cartesia.voices[0].id,
        voiceSettings: {
          speed: vs.speed,
          emotion: vs.emotion,
          stability: vs.stability,
          similarityBoost: vs.similarityBoost,
          style: vs.style,
          speakerBoost: vs.speakerBoost,
          voice: vs.voice,
        },
        backgroundNoise: vs.backgroundNoise || { enabled: false, type: "none", volume: 0.3 },
        llmProvider: (editAgent.llmProvider as any) || "openai",
        llmModel: editAgent.llmModel || "gpt-4o-mini",
        llmSettings: {
          temperature: ls.temperature ?? 0.7,
          maxTokens: ls.maxTokens ?? 500,
          topP: ls.topP,
        },
        systemPrompt: editAgent.systemPrompt || "",
        openingMessage: vs.openingMessage || "",
        variables: vs.variables || [...DEFAULT_VARIABLES],
        transferConfig: {
          enabled: editAgent.transferEnabled ?? false,
          destinations: transferCfg?.destinations || editAgent.transferDestinations || [],
          defaultDestination: transferCfg?.defaultDestination || "support",
        },
        voicemailConfig: {
          detectionMessage: vmCfg?.detectionMessage || "",
          leaveMessage: vmCfg?.leaveMessage ?? true,
          message: vmCfg?.message || editAgent.voicemailMessage || "",
        },
        smsConfig: {
          followUpMessage: smsCfg?.followUpMessage || "",
          sendAfterCall: smsCfg?.sendAfterCall ?? false,
        },
        emailConfig: {
          followUpSubject: emailCfg?.followUpSubject || "",
          followUpBody: emailCfg?.followUpBody || "",
          sendAfterCall: emailCfg?.sendAfterCall ?? false,
        },
        ivrConfig: {
          targetOption: ivrCfg?.targetOption || "",
        },
        actions: {
          transferCall: isActionEnabled("transferCall"),
          bookAppointment: isActionEnabled("bookAppointment"),
          sendSms: isActionEnabled("sendSms"),
          sendEmail: isActionEnabled("sendEmail"),
          endCall: isActionEnabled("endCall"),
          leaveVoicemail: isActionEnabled("leaveVoicemail"),
          ivrNavigation: isActionEnabled("ivrNavigation"),
        },
      })
      setCurrentStep(0)
    }
  }, [editAgent, open])

  const updateConfig = <K extends keyof AgentConfig>(key: K, value: AgentConfig[K]) => {
    setConfig(prev => ({ ...prev, [key]: value }))
  }

  const handleVoiceProviderChange = (provider: "cartesia" | "elevenlabs" | "openai") => {
    const providerConfig = VOICE_PROVIDERS[provider]
    setConfig(prev => ({
      ...prev,
      voiceProvider: provider,
      voiceId: providerConfig.voices[0].id,
      voiceSettings: providerConfig.defaultSettings,
    }))
  }

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(prev => prev + 1)
    }
  }

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1)
    }
  }

  const handleSave = async () => {
    const payload = {
      name: config.name,
      description: config.description,
      systemPrompt: config.systemPrompt,
      voiceProvider: config.voiceProvider,
      voiceId: config.voiceId,
      voiceSettings: {
        ...config.voiceSettings,
        backgroundNoise: config.backgroundNoise,
        openingMessage: config.openingMessage,
      },
      llmProvider: config.llmProvider,
      llmModel: config.llmModel,
      llmSettings: config.llmSettings,
      actions: config.actions,
      transferConfig: config.transferConfig,
      voicemailConfig: config.voicemailConfig,
      smsConfig: config.smsConfig,
      emailConfig: config.emailConfig,
      ivrConfig: config.ivrConfig,
      variables: config.variables,
    }

    if (isEditMode && editAgent) {
      await updateAgent.mutateAsync({ id: editAgent.id, data: payload })
    } else {
      await createAgent.mutateAsync(payload)
    }
    
    // Reset and close
    setCurrentStep(0)
    setConfig({
      name: "",
      description: "",
      voiceProvider: "cartesia",
      voiceId: VOICE_PROVIDERS.cartesia.voices[0].id,
      voiceSettings: VOICE_PROVIDERS.cartesia.defaultSettings,
      backgroundNoise: { enabled: false, type: "none", volume: 0.3 },
      llmProvider: "openai",
      llmModel: "gpt-4o-mini",
      llmSettings: { temperature: 0.7, maxTokens: 500 },
      systemPrompt: "",
      openingMessage: "Hi {{first_name}}, this is Sarah calling from {{company_name}}. How are you doing today?",
      variables: [...DEFAULT_VARIABLES],
      transferConfig: {
        enabled: true,
        destinations: [
          { id: "support", name: "Support", phoneNumber: "", description: "Customer support team" },
          { id: "sales", name: "Sales", phoneNumber: "", description: "Sales department" },
          { id: "billing", name: "Billing", phoneNumber: "", description: "Billing inquiries" },
        ],
        defaultDestination: "support",
      },
      voicemailConfig: {
        detectionMessage: "Hello, you've reached our voicemail. Please leave a message after the tone.",
        leaveMessage: true,
        message: "Hi {{first_name}}, this is {{company_name}} calling. We'd love to connect with you. Please call us back at your convenience. Thank you!",
      },
      smsConfig: {
        followUpMessage: "Hi {{first_name}}, thanks for speaking with us at {{company_name}}! If you have any questions, feel free to reply to this message.",
        sendAfterCall: false,
      },
      emailConfig: {
        followUpSubject: "Following up on our call - {{company_name}}",
        followUpBody: "Hi {{first_name}},\n\nThank you for taking the time to speak with us today.\n\nBest regards,\n{{company_name}}",
        sendAfterCall: false,
      },
      ivrConfig: {
        targetOption: "",
      },
      actions: {
        transferCall: true,
        bookAppointment: true,
        sendSms: false,
        sendEmail: false,
        endCall: true,
        leaveVoicemail: true,
        ivrNavigation: false,
      },
    })
    onOpenChange(false)
  }

  const canProceed = () => {
    switch (currentStep) {
      case 0: return config.name.trim().length > 0
      case 1: return config.voiceId.length > 0
      case 2: return config.llmModel.length > 0
      case 3: return config.systemPrompt.trim().length > 0
      case 4: return true
      case 5: return true
      default: return false
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl !p-0 flex flex-col" style={{ height: '85vh', maxHeight: '85vh' }}>
        <div className="flex flex-1 min-h-0">
          {/* Sidebar - Steps */}
          <div className="w-64 bg-muted/30 border-r p-6 hidden md:block overflow-y-auto">
            <DialogHeader className="mb-6">
              <DialogTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5" />
                {isEditMode ? "Configure Agent" : "Agent Builder"}
              </DialogTitle>
              <DialogDescription>
                {isEditMode ? `Editing ${editAgent?.name}` : "Create a new AI voice agent"}
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-1">
              {STEPS.map((step, index) => {
                const Icon = step.icon
                const isCompleted = index < currentStep
                const isCurrent = index === currentStep
                
                return (
                  <button
                    key={step.id}
                    onClick={() => index <= currentStep && setCurrentStep(index)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                      isCurrent && "bg-primary text-primary-foreground",
                      isCompleted && "text-primary hover:bg-muted",
                      !isCurrent && !isCompleted && "text-muted-foreground cursor-not-allowed"
                    )}
                    disabled={index > currentStep}
                  >
                    <div className={cn(
                      "flex h-6 w-6 items-center justify-center rounded-full text-xs",
                      isCurrent && "bg-primary-foreground text-primary",
                      isCompleted && "bg-primary text-primary-foreground",
                      !isCurrent && !isCompleted && "bg-muted"
                    )}>
                      {isCompleted ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-3 w-3" />}
                    </div>
                    {step.title}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 flex flex-col min-h-0">
            {/* Mobile Steps Indicator */}
            <div className="md:hidden flex items-center gap-2 p-4 border-b overflow-x-auto">
              {STEPS.map((step, index) => (
                <div
                  key={step.id}
                  className={cn(
                    "flex items-center gap-1 px-2 py-1 rounded-full text-xs whitespace-nowrap",
                    index === currentStep && "bg-primary text-primary-foreground",
                    index < currentStep && "text-primary",
                    index > currentStep && "text-muted-foreground"
                  )}
                >
                  {index < currentStep ? <CheckCircle2 className="h-3 w-3" /> : <span>{index + 1}</span>}
                  <span className="hidden sm:inline">{step.title}</span>
                </div>
              ))}
            </div>

            {/* Step Content */}
            <ScrollArea className="flex-1">
              <div className="p-6">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={currentStep}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.2 }}
                  >
                    {currentStep === 0 && (
                      <BasicInfoStep config={config} updateConfig={updateConfig} />
                    )}
                    {currentStep === 1 && (
                      <VoiceStep 
                        config={config} 
                        updateConfig={updateConfig}
                        onProviderChange={handleVoiceProviderChange}
                      />
                    )}
                    {currentStep === 2 && (
                      <LLMStep config={config} updateConfig={updateConfig} />
                    )}
                    {currentStep === 3 && (
                      <PromptStep 
                        config={config} 
                        updateConfig={updateConfig}
                        selectedTemplate={selectedTemplate}
                        setSelectedTemplate={setSelectedTemplate}
                      />
                    )}
                    {currentStep === 4 && (
                      <ActionsStep config={config} updateConfig={updateConfig} />
                    )}
                    {currentStep === 5 && (
                      <ReviewStep config={config} />
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>
            </ScrollArea>

            {/* Footer */}
            <div className="flex items-center justify-between p-4 border-t bg-background shrink-0">
              <Button
                variant="outline"
                onClick={handleBack}
                disabled={currentStep === 0}
              >
                <ChevronLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  Step {currentStep + 1} of {STEPS.length}
                </span>
              </div>

              {currentStep === STEPS.length - 1 ? (
                <Button 
                  onClick={handleSave}
                  disabled={createAgent.isPending || updateAgent.isPending}
                >
                  {(createAgent.isPending || updateAgent.isPending) ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {isEditMode ? "Saving..." : "Creating..."}
                    </>
                  ) : (
                    <>
                      {isEditMode ? "Save Changes" : "Create Agent"}
                      <CheckCircle2 className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              ) : (
                <Button onClick={handleNext} disabled={!canProceed()}>
                  Next
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// Step Components
function BasicInfoStep({ 
  config, 
  updateConfig 
}: { 
  config: AgentConfig
  updateConfig: <K extends keyof AgentConfig>(key: K, value: AgentConfig[K]) => void 
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Basic Information</h2>
        <p className="text-muted-foreground">Give your agent a name and description</p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="agent-name">Agent Name *</Label>
          <Input
            id="agent-name"
            placeholder="e.g., Sales Agent, Support Bot"
            value={config.name}
            onChange={(e) => updateConfig("name", e.target.value)}
            className="text-lg"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="agent-description">Description</Label>
          <Textarea
            id="agent-description"
            placeholder="What does this agent do? (optional)"
            value={config.description}
            onChange={(e) => updateConfig("description", e.target.value)}
            rows={3}
          />
        </div>
      </div>
    </div>
  )
}

function VoiceStep({ 
  config, 
  updateConfig,
  onProviderChange 
}: { 
  config: AgentConfig
  updateConfig: <K extends keyof AgentConfig>(key: K, value: AgentConfig[K]) => void
  onProviderChange: (provider: "cartesia" | "elevenlabs" | "openai") => void
}) {
  const currentProvider = VOICE_PROVIDERS[config.voiceProvider]
  const { token } = useAuthStore()
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null)
  const [loadingVoiceId, setLoadingVoiceId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const handlePlayPreview = useCallback(async (e: React.MouseEvent, voiceId: string) => {
    e.stopPropagation()

    // If already playing this voice, stop it
    if (playingVoiceId === voiceId) {
      audioRef.current?.pause()
      audioRef.current = null
      setPlayingVoiceId(null)
      return
    }

    // Stop any currently playing audio
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
      setPlayingVoiceId(null)
    }

    setLoadingVoiceId(voiceId)
    try {
      const response = await fetch(`${API_URL}/voice/preview`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          provider: config.voiceProvider,
          voiceId,
          voiceSettings: config.voiceSettings,
        }),
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Unknown error' }))
        toast.error(err.error || 'Failed to generate preview')
        setLoadingVoiceId(null)
        return
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audioRef.current = audio
      setPlayingVoiceId(voiceId)
      setLoadingVoiceId(null)

      audio.onended = () => {
        setPlayingVoiceId(null)
        audioRef.current = null
        URL.revokeObjectURL(url)
      }
      audio.onerror = () => {
        setPlayingVoiceId(null)
        audioRef.current = null
        toast.error('Failed to play audio')
      }
      audio.play()
    } catch (err) {
      console.error('Voice preview error:', err)
      toast.error('Failed to generate voice preview')
      setLoadingVoiceId(null)
    }
  }, [config.voiceProvider, config.voiceSettings, playingVoiceId, token])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Voice Configuration</h2>
        <p className="text-muted-foreground">Choose how your agent sounds</p>
      </div>

      {/* Voice Provider Selection */}
      <div className="space-y-3">
        <Label>Voice Provider</Label>
        <div className="grid grid-cols-3 gap-3">
          {(Object.entries(VOICE_PROVIDERS) as [keyof typeof VOICE_PROVIDERS, typeof VOICE_PROVIDERS.cartesia][]).map(([key, provider]) => (
            <Card
              key={key}
              className={cn(
                "cursor-pointer transition-all hover:border-primary",
                config.voiceProvider === key && "border-primary bg-primary/5"
              )}
              onClick={() => onProviderChange(key)}
            >
              <CardContent className="p-4">
                <div className="font-semibold">{provider.name}</div>
                <div className="text-xs text-muted-foreground mt-1">{provider.description}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Voice Selection */}
      <div className="space-y-3">
        <Label>Select Voice</Label>
        <div className="grid grid-cols-2 gap-2">
          {currentProvider.voices.map((voice) => (
            <Card
              key={voice.id}
              className={cn(
                "cursor-pointer transition-all hover:border-primary",
                config.voiceId === voice.id && "border-primary bg-primary/5"
              )}
              onClick={() => updateConfig("voiceId", voice.id)}
            >
              <CardContent className="p-3 flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Volume2 className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <div className="font-medium">{voice.name}</div>
                  <div className="text-xs text-muted-foreground">{voice.description}</div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={(e) => handlePlayPreview(e, voice.id)}
                  disabled={loadingVoiceId === voice.id}
                >
                  {loadingVoiceId === voice.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : playingVoiceId === voice.id ? (
                    <Pause className="h-4 w-4" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Provider-specific Settings */}
      <div className="space-y-4 pt-4 border-t">
        <Label className="flex items-center gap-2">
          <Settings2 className="h-4 w-4" />
          Voice Settings
        </Label>
        
        {config.voiceProvider === "cartesia" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Speed</Label>
                <span className="text-sm text-muted-foreground">
                  {(config.voiceSettings.speed || 1).toFixed(1)}x
                </span>
              </div>
              <Slider
                value={[config.voiceSettings.speed || 1]}
                onValueChange={([value]) => updateConfig("voiceSettings", { ...config.voiceSettings, speed: value })}
                min={0.5}
                max={2}
                step={0.1}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Slow</span>
                <span>Normal</span>
                <span>Fast</span>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>Emotion (Multi-select)</Label>
              <div className="flex flex-wrap gap-2">
                {["neutral", "happy", "sad", "angry", "curious", "surprised"].map((emotion) => (
                  <Badge
                    key={emotion}
                    variant={(config.voiceSettings.emotion || []).includes(emotion) ? "default" : "outline"}
                    className="cursor-pointer capitalize"
                    onClick={() => {
                      const current = config.voiceSettings.emotion || []
                      const updated = current.includes(emotion)
                        ? current.filter(e => e !== emotion)
                        : [...current, emotion]
                      updateConfig("voiceSettings", { ...config.voiceSettings, emotion: updated })
                    }}
                  >
                    {emotion}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        )}

        {config.voiceProvider === "elevenlabs" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Stability</Label>
                <span className="text-sm text-muted-foreground">
                  {((config.voiceSettings.stability || 0.5) * 100).toFixed(0)}%
                </span>
              </div>
              <Slider
                value={[(config.voiceSettings.stability || 0.5) * 100]}
                onValueChange={([value]) => updateConfig("voiceSettings", { ...config.voiceSettings, stability: value / 100 })}
                min={0}
                max={100}
              />
              <p className="text-xs text-muted-foreground">
                Higher stability = more consistent, lower = more expressive
              </p>
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Similarity Boost</Label>
                <span className="text-sm text-muted-foreground">
                  {((config.voiceSettings.similarityBoost || 0.75) * 100).toFixed(0)}%
                </span>
              </div>
              <Slider
                value={[(config.voiceSettings.similarityBoost || 0.75) * 100]}
                onValueChange={([value]) => updateConfig("voiceSettings", { ...config.voiceSettings, similarityBoost: value / 100 })}
                min={0}
                max={100}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Style Exaggeration</Label>
                <span className="text-sm text-muted-foreground">
                  {((config.voiceSettings.style || 0) * 100).toFixed(0)}%
                </span>
              </div>
              <Slider
                value={[(config.voiceSettings.style || 0) * 100]}
                onValueChange={([value]) => updateConfig("voiceSettings", { ...config.voiceSettings, style: value / 100 })}
                min={0}
                max={100}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>Speaker Boost</Label>
                <p className="text-xs text-muted-foreground">Enhances voice clarity</p>
              </div>
              <Switch
                checked={config.voiceSettings.speakerBoost ?? true}
                onCheckedChange={(checked) => updateConfig("voiceSettings", { ...config.voiceSettings, speakerBoost: checked })}
              />
            </div>
          </div>
        )}

        {config.voiceProvider === "openai" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              OpenAI TTS voices have fixed settings optimized for natural speech.
              Voice selection above determines the characteristics.
            </p>
          </div>
        )}
      </div>

      {/* Background Noise */}
      <div className="space-y-4 pt-4 border-t">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-2">
            <Headphones className="h-4 w-4" />
            Background Noise
          </Label>
          <Switch
            checked={config.backgroundNoise.enabled}
            onCheckedChange={(enabled) => updateConfig("backgroundNoise", { 
              ...config.backgroundNoise, 
              enabled,
              type: enabled && config.backgroundNoise.type === "none" ? "office" : config.backgroundNoise.type
            })}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Add ambient background sounds to make calls feel more natural
        </p>

        {config.backgroundNoise.enabled && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              {BACKGROUND_NOISE_OPTIONS.filter(opt => opt.id !== "none").map((option) => {
                const Icon = option.icon
                return (
                  <Card
                    key={option.id}
                    className={cn(
                      "cursor-pointer transition-all hover:border-primary",
                      config.backgroundNoise.type === option.id && "border-primary bg-primary/5"
                    )}
                    onClick={() => updateConfig("backgroundNoise", { ...config.backgroundNoise, type: option.id as BackgroundNoiseConfig["type"] })}
                  >
                    <CardContent className="p-3 flex items-center gap-3">
                      <div className={cn(
                        "h-10 w-10 rounded-lg flex items-center justify-center transition-colors",
                        config.backgroundNoise.type === option.id ? "bg-primary text-primary-foreground" : "bg-muted"
                      )}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="flex-1">
                        <div className="font-medium">{option.name}</div>
                        <div className="text-xs text-muted-foreground">{option.description}</div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Volume</Label>
                <span className="text-sm text-muted-foreground">
                  {Math.round(config.backgroundNoise.volume * 100)}%
                </span>
              </div>
              <Slider
                value={[config.backgroundNoise.volume * 100]}
                onValueChange={([value]) => updateConfig("backgroundNoise", { ...config.backgroundNoise, volume: value / 100 })}
                min={5}
                max={50}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Subtle</span>
                <span>Moderate</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function LLMStep({ 
  config, 
  updateConfig 
}: { 
  config: AgentConfig
  updateConfig: <K extends keyof AgentConfig>(key: K, value: AgentConfig[K]) => void 
}) {
  const currentProvider = LLM_PROVIDERS[config.llmProvider]
  
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">LLM Configuration</h2>
        <p className="text-muted-foreground">Choose the AI brain for your agent</p>
      </div>

      {/* LLM Provider Selection */}
      <div className="space-y-3">
        <Label>LLM Provider</Label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(Object.entries(LLM_PROVIDERS) as [keyof typeof LLM_PROVIDERS, typeof LLM_PROVIDERS.openai][]).map(([key, provider]) => (
            <Card
              key={key}
              className={cn(
                "cursor-pointer transition-all hover:border-primary",
                config.llmProvider === key && "border-primary bg-primary/5"
              )}
              onClick={() => {
                updateConfig("llmProvider", key)
                updateConfig("llmModel", LLM_PROVIDERS[key].models[0].id)
              }}
            >
              <CardContent className="p-4">
                <div className="font-semibold">{provider.name}</div>
                <div className="text-xs text-muted-foreground mt-1">{provider.description}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Model Selection */}
      <div className="space-y-3">
        <Label>Select Model</Label>
        <div className="space-y-2">
          {currentProvider.models.map((model) => (
            <Card
              key={model.id}
              className={cn(
                "cursor-pointer transition-all hover:border-primary",
                config.llmModel === model.id && "border-primary bg-primary/5"
              )}
              onClick={() => updateConfig("llmModel", model.id)}
            >
              <CardContent className="p-4 flex items-center gap-4">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Brain className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <div className="font-medium">{model.name}</div>
                  <div className="text-sm text-muted-foreground">{model.description}</div>
                </div>
                {config.llmModel === model.id && (
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* LLM Settings */}
      <div className="space-y-4 pt-4 border-t">
        <Label className="flex items-center gap-2">
          <Settings2 className="h-4 w-4" />
          Model Settings
        </Label>
        
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Temperature</Label>
              <span className="text-sm text-muted-foreground">
                {config.llmSettings.temperature.toFixed(1)}
              </span>
            </div>
            <Slider
              value={[config.llmSettings.temperature * 10]}
              onValueChange={([value]) => updateConfig("llmSettings", { ...config.llmSettings, temperature: value / 10 })}
              min={0}
              max={10}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Precise (0)</span>
              <span>Balanced</span>
              <span>Creative (1)</span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Max Tokens</Label>
              <span className="text-sm text-muted-foreground">
                {config.llmSettings.maxTokens}
              </span>
            </div>
            <Slider
              value={[config.llmSettings.maxTokens]}
              onValueChange={([value]) => updateConfig("llmSettings", { ...config.llmSettings, maxTokens: value })}
              min={100}
              max={2000}
              step={50}
            />
            <p className="text-xs text-muted-foreground">
              Maximum response length (higher = longer responses, more cost)
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function PromptStep({ 
  config, 
  updateConfig,
  selectedTemplate,
  setSelectedTemplate
}: { 
  config: AgentConfig
  updateConfig: <K extends keyof AgentConfig>(key: K, value: AgentConfig[K]) => void
  selectedTemplate: string | null
  setSelectedTemplate: (id: string | null) => void
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">System Prompt</h2>
        <p className="text-muted-foreground">Define your agent&apos;s personality and behavior</p>
      </div>

      {/* Template Selection */}
      <div className="space-y-3">
        <Label>Start from a template</Label>
        <div className="grid grid-cols-2 gap-3">
          {PROMPT_TEMPLATES.map((template) => {
            const Icon = template.icon
            return (
              <Card
                key={template.id}
                className={cn(
                  "cursor-pointer transition-all hover:border-primary",
                  selectedTemplate === template.id && "border-primary bg-primary/5"
                )}
                onClick={() => {
                  setSelectedTemplate(template.id)
                  if (template.prompt) {
                    updateConfig("systemPrompt", template.prompt)
                  }
                }}
              >
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <span className="font-medium">{template.name}</span>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>

      {/* Opening Message */}
      <div className="space-y-3 pt-4 border-t">
        <div className="space-y-2">
          <Label htmlFor="opening-message" className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Opening Message
          </Label>
          <p className="text-xs text-muted-foreground">
            The first thing your agent says when the call connects. Use variables like {"{{first_name}}"} to personalize.
          </p>
        </div>
        <Textarea
          id="opening-message"
          placeholder="Hi {{first_name}}, this is Sarah calling from Acme Corp. How are you today?"
          value={config.openingMessage}
          onChange={(e) => updateConfig("openingMessage", e.target.value)}
          rows={3}
          className="font-mono text-sm"
        />
        {/* Quick Insert for Opening Message */}
        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-muted-foreground mr-2">Insert:</span>
          {config.variables.filter(v => v.csvColumn).map((variable) => (
            <Badge
              key={variable.id}
              variant="outline"
              className="cursor-pointer hover:bg-primary hover:text-primary-foreground text-xs"
              onClick={() => {
                const varTag = `{{${variable.csvColumn}}}`
                updateConfig("openingMessage", config.openingMessage + varTag)
              }}
            >
              {`{{${variable.csvColumn}}}`}
            </Badge>
          ))}
        </div>
      </div>

      {/* Variables Section */}
      <div className="space-y-3 pt-4 border-t">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-2">
            <Variable className="h-4 w-4" />
            Customer Variables
          </Label>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const newVar: AgentVariable = {
                id: `var_${Date.now()}`,
                name: "",
                csvColumn: "",
                defaultValue: ""
              }
              updateConfig("variables", [...config.variables, newVar])
            }}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Variable
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Use variables like <code className="bg-muted px-1 rounded">{"{{first_name}}"}</code> in your prompt to personalize calls based on CSV data
        </p>

        <div className="space-y-2">
          {config.variables.map((variable, index) => (
            <Card key={variable.id} className="p-3">
              <div className="grid grid-cols-12 gap-2 items-center">
                <div className="col-span-3">
                  <Input
                    placeholder="Variable name"
                    value={variable.name}
                    onChange={(e) => {
                      const updated = [...config.variables]
                      updated[index] = { ...variable, name: e.target.value }
                      updateConfig("variables", updated)
                    }}
                    className="text-sm"
                  />
                </div>
                <div className="col-span-3">
                  <Input
                    placeholder="CSV column"
                    value={variable.csvColumn}
                    onChange={(e) => {
                      const updated = [...config.variables]
                      updated[index] = { ...variable, csvColumn: e.target.value }
                      updateConfig("variables", updated)
                    }}
                    className="text-sm"
                  />
                </div>
                <div className="col-span-3">
                  <Input
                    placeholder="Default value"
                    value={variable.defaultValue}
                    onChange={(e) => {
                      const updated = [...config.variables]
                      updated[index] = { ...variable, defaultValue: e.target.value }
                      updateConfig("variables", updated)
                    }}
                    className="text-sm"
                  />
                </div>
                <div className="col-span-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-xs"
                    onClick={() => {
                      const varTag = `{{${variable.csvColumn || variable.name.toLowerCase().replace(/\s+/g, '_')}}}`
                      updateConfig("systemPrompt", config.systemPrompt + varTag)
                    }}
                  >
                    Insert
                  </Button>
                </div>
                <div className="col-span-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => {
                      updateConfig("variables", config.variables.filter((_, i) => i !== index))
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Quick Insert Buttons */}
        <div className="flex flex-wrap gap-2 pt-2">
          <span className="text-xs text-muted-foreground mr-2">Quick insert:</span>
          {config.variables.filter(v => v.csvColumn).map((variable) => (
            <Badge
              key={variable.id}
              variant="outline"
              className="cursor-pointer hover:bg-primary hover:text-primary-foreground"
              onClick={() => {
                const varTag = `{{${variable.csvColumn}}}`
                updateConfig("systemPrompt", config.systemPrompt + varTag)
              }}
            >
              {`{{${variable.csvColumn}}}`}
            </Badge>
          ))}
        </div>
      </div>

      {/* Prompt Editor */}
      <div className="space-y-3">
        <Label htmlFor="system-prompt">System Prompt *</Label>
        <Textarea
          id="system-prompt"
          placeholder="You are a helpful AI assistant. Start by greeting the customer: 'Hi {{first_name}}!'"
          value={config.systemPrompt}
          onChange={(e) => updateConfig("systemPrompt", e.target.value)}
          rows={10}
          className="font-mono text-sm"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Use {"{{variable}}"} syntax to insert customer data</span>
          <span>{config.systemPrompt.length} characters</span>
        </div>
      </div>
    </div>
  )
}

function ActionsStep({ 
  config, 
  updateConfig 
}: { 
  config: AgentConfig
  updateConfig: <K extends keyof AgentConfig>(key: K, value: AgentConfig[K]) => void 
}) {
  const actions = [
    { id: "transferCall", label: "Transfer Call", description: "Transfer to a human agent or different department", icon: PhoneForwarded },
    { id: "leaveVoicemail", label: "Leave Voicemail", description: "Leave a message if call goes to voicemail", icon: VoicemailIcon },
    { id: "sendSms", label: "Send SMS", description: "Send follow-up text messages", icon: MessageSquare },
    { id: "sendEmail", label: "Send Email", description: "Send confirmation or follow-up emails", icon: Send },
    { id: "bookAppointment", label: "Book Appointment", description: "Schedule appointments in connected calendar", icon: Calendar },
    { id: "ivrNavigation", label: "IVR Navigation", description: "Navigate automated phone menus and voicemail systems", icon: Hash },
    { id: "endCall", label: "End Call", description: "Gracefully end the conversation", icon: X },
  ] as const

  const updateTransferDestination = (destId: string, field: string, value: string) => {
    const updatedDestinations = config.transferConfig.destinations.map(dest =>
      dest.id === destId ? { ...dest, [field]: value } : dest
    )
    updateConfig("transferConfig", {
      ...config.transferConfig,
      destinations: updatedDestinations
    })
  }

  const addTransferDestination = () => {
    const newDest: TransferDestination = {
      id: `dept_${Date.now()}`,
      name: "",
      phoneNumber: "",
      description: ""
    }
    updateConfig("transferConfig", {
      ...config.transferConfig,
      destinations: [...config.transferConfig.destinations, newDest]
    })
  }

  const removeTransferDestination = (destId: string) => {
    updateConfig("transferConfig", {
      ...config.transferConfig,
      destinations: config.transferConfig.destinations.filter(d => d.id !== destId)
    })
  }
  
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Agent Actions</h2>
        <p className="text-muted-foreground">Enable capabilities for your agent</p>
      </div>

      <div className="space-y-3">
        {actions.map((action) => {
          const Icon = action.icon
          const isEnabled = config.actions[action.id as keyof typeof config.actions]
          
          return (
            <div key={action.id} className="space-y-3">
              <Card
                className={cn(
                  "cursor-pointer transition-all",
                  isEnabled && "border-primary bg-primary/5"
                )}
                onClick={() => {
                  updateConfig("actions", {
                    ...config.actions,
                    [action.id]: !isEnabled
                  })
                }}
              >
                <CardContent className="p-4 flex items-center gap-4">
                  <div className={cn(
                    "h-10 w-10 rounded-lg flex items-center justify-center transition-colors",
                    isEnabled ? "bg-primary text-primary-foreground" : "bg-muted"
                  )}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <div className="font-medium">{action.label}</div>
                    <div className="text-sm text-muted-foreground">{action.description}</div>
                  </div>
                  <Switch checked={isEnabled} />
                </CardContent>
              </Card>

              {/* Transfer Call Configuration */}
              {action.id === "transferCall" && isEnabled && (
                <Card className="ml-6 border-dashed">
                  <CardContent className="p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium text-sm">Transfer Destinations</h4>
                        <p className="text-xs text-muted-foreground">Configure phone numbers for each department</p>
                      </div>
                      <Button size="sm" variant="outline" onClick={addTransferDestination}>
                        <Plus className="h-4 w-4 mr-1" />
                        Add
                      </Button>
                    </div>
                    
                    <div className="space-y-3">
                      {config.transferConfig.destinations.map((dest) => (
                        <div key={dest.id} className="flex items-start gap-2 p-3 bg-muted/50 rounded-lg">
                          <div className="flex-1 grid grid-cols-2 gap-2">
                            <div>
                              <Label className="text-xs">Department Name</Label>
                              <Input
                                placeholder="e.g., Support"
                                value={dest.name}
                                onChange={(e) => updateTransferDestination(dest.id, "name", e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                className="h-8 text-sm"
                              />
                            </div>
                            <div>
                              <Label className="text-xs">Phone Number</Label>
                              <Input
                                placeholder="+1 (555) 123-4567"
                                value={dest.phoneNumber}
                                onChange={(e) => updateTransferDestination(dest.id, "phoneNumber", e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                className="h-8 text-sm"
                              />
                            </div>
                          </div>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation()
                              removeTransferDestination(dest.id)
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>

                    {config.transferConfig.destinations.length > 0 && (
                      <div>
                        <Label className="text-xs">Default Transfer Destination</Label>
                        <Select
                          value={config.transferConfig.defaultDestination}
                          onValueChange={(value) => updateConfig("transferConfig", {
                            ...config.transferConfig,
                            defaultDestination: value
                          })}
                        >
                          <SelectTrigger className="h-8 text-sm" onClick={(e) => e.stopPropagation()}>
                            <SelectValue placeholder="Select default" />
                          </SelectTrigger>
                          <SelectContent>
                            {config.transferConfig.destinations.map((dest) => (
                              <SelectItem key={dest.id} value={dest.id}>
                                {dest.name || dest.id}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    <div className="text-xs text-muted-foreground bg-blue-500/10 border border-blue-500/20 rounded p-2">
                      <strong>How it works:</strong> When the AI decides to transfer a call, it will seamlessly connect the 
                      caller to the destination phone number. The AI will announce the transfer, then the caller will 
                      be connected to the human agent.
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Leave Voicemail Configuration */}
              {action.id === "leaveVoicemail" && isEnabled && (
                <Card className="ml-6 border-dashed">
                  <CardContent className="p-4 space-y-4">
                    <h4 className="font-medium text-sm">Voicemail Settings</h4>
                    
                    <div className="space-y-2">
                      <Label className="text-xs">Voicemail Detection Message</Label>
                      <p className="text-xs text-muted-foreground">What the agent says to detect if it reached voicemail</p>
                      <Textarea
                        placeholder="Hello? Is anyone there?"
                        value={config.voicemailConfig.detectionMessage}
                        onChange={(e) => updateConfig("voicemailConfig", {
                          ...config.voicemailConfig,
                          detectionMessage: e.target.value
                        })}
                        onClick={(e) => e.stopPropagation()}
                        rows={2}
                        className="text-sm"
                      />
                    </div>

                    <div className="flex items-center justify-between" onClick={(e) => e.stopPropagation()}>
                      <div>
                        <Label className="text-xs">Leave Message on Voicemail</Label>
                        <p className="text-xs text-muted-foreground">Agent will leave a message after the beep</p>
                      </div>
                      <Switch
                        checked={config.voicemailConfig.leaveMessage}
                        onCheckedChange={(checked) => updateConfig("voicemailConfig", {
                          ...config.voicemailConfig,
                          leaveMessage: checked
                        })}
                      />
                    </div>

                    {config.voicemailConfig.leaveMessage && (
                      <div className="space-y-2">
                        <Label className="text-xs">Voicemail Message Template</Label>
                        <Textarea
                          placeholder="Hi {{first_name}}, this is {{company_name}} calling..."
                          value={config.voicemailConfig.message}
                          onChange={(e) => updateConfig("voicemailConfig", {
                            ...config.voicemailConfig,
                            message: e.target.value
                          })}
                          onClick={(e) => e.stopPropagation()}
                          rows={3}
                          className="text-sm"
                        />
                        <p className="text-xs text-muted-foreground">Use {"{{variable}}"} syntax for personalization</p>
                      </div>
                    )}

                    <div className="text-xs text-muted-foreground bg-blue-500/10 border border-blue-500/20 rounded p-2">
                      <strong>How it works:</strong> If the agent detects voicemail (beep tone or greeting), it will 
                      leave your configured message and then hang up.
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Send SMS Configuration */}
              {action.id === "sendSms" && isEnabled && (
                <Card className="ml-6 border-dashed">
                  <CardContent className="p-4 space-y-4">
                    <h4 className="font-medium text-sm">SMS Settings</h4>

                    <div className="flex items-center justify-between" onClick={(e) => e.stopPropagation()}>
                      <div>
                        <Label className="text-xs">Auto-send After Call</Label>
                        <p className="text-xs text-muted-foreground">Automatically send SMS when the call ends</p>
                      </div>
                      <Switch
                        checked={config.smsConfig.sendAfterCall}
                        onCheckedChange={(checked) => updateConfig("smsConfig", {
                          ...config.smsConfig,
                          sendAfterCall: checked
                        })}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs">Follow-up SMS Template</Label>
                      <Textarea
                        placeholder="Hi {{first_name}}, thanks for speaking with us..."
                        value={config.smsConfig.followUpMessage}
                        onChange={(e) => updateConfig("smsConfig", {
                          ...config.smsConfig,
                          followUpMessage: e.target.value
                        })}
                        onClick={(e) => e.stopPropagation()}
                        rows={3}
                        className="text-sm"
                      />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Use {"{{variable}}"} syntax for personalization</span>
                        <span>{config.smsConfig.followUpMessage.length}/160 chars</span>
                      </div>
                    </div>

                    <div className="text-xs text-muted-foreground bg-blue-500/10 border border-blue-500/20 rounded p-2">
                      <strong>How it works:</strong> The agent can send an SMS during or after the call using your 
                      configured telephony provider. The AI can also dynamically compose messages based on the conversation.
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Send Email Configuration */}
              {action.id === "sendEmail" && isEnabled && (
                <Card className="ml-6 border-dashed">
                  <CardContent className="p-4 space-y-4">
                    <h4 className="font-medium text-sm">Email Settings</h4>

                    <div className="flex items-center justify-between" onClick={(e) => e.stopPropagation()}>
                      <div>
                        <Label className="text-xs">Auto-send After Call</Label>
                        <p className="text-xs text-muted-foreground">Automatically send email when the call ends</p>
                      </div>
                      <Switch
                        checked={config.emailConfig.sendAfterCall}
                        onCheckedChange={(checked) => updateConfig("emailConfig", {
                          ...config.emailConfig,
                          sendAfterCall: checked
                        })}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs">Email Subject</Label>
                      <Input
                        placeholder="Following up on our call - {{company_name}}"
                        value={config.emailConfig.followUpSubject}
                        onChange={(e) => updateConfig("emailConfig", {
                          ...config.emailConfig,
                          followUpSubject: e.target.value
                        })}
                        onClick={(e) => e.stopPropagation()}
                        className="h-8 text-sm"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs">Email Body Template</Label>
                      <Textarea
                        placeholder="Hi {{first_name}},\n\nThank you for speaking with us..."
                        value={config.emailConfig.followUpBody}
                        onChange={(e) => updateConfig("emailConfig", {
                          ...config.emailConfig,
                          followUpBody: e.target.value
                        })}
                        onClick={(e) => e.stopPropagation()}
                        rows={5}
                        className="text-sm font-mono"
                      />
                      <p className="text-xs text-muted-foreground">Use {"{{variable}}"} syntax for personalization</p>
                    </div>

                    <div className="text-xs text-muted-foreground bg-blue-500/10 border border-blue-500/20 rounded p-2">
                      <strong>How it works:</strong> After the call, a follow-up email will be sent to the contact 
                      using the template above. The AI can customize the email based on what was discussed.
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Book Appointment Configuration */}
              {action.id === "bookAppointment" && isEnabled && (
                <Card className="ml-6 border-dashed">
                  <CardContent className="p-4 space-y-4">
                    <h4 className="font-medium text-sm">Appointment Booking</h4>

                    <div className="text-xs text-muted-foreground bg-amber-500/10 border border-amber-500/20 rounded p-2">
                      <strong>Coming soon:</strong> Calendar integration with Google Calendar, Calendly, and Cal.com. 
                      For now, the agent will collect the caller&apos;s preferred date/time and save it to the call notes 
                      for manual booking.
                    </div>

                    <div className="text-xs text-muted-foreground bg-blue-500/10 border border-blue-500/20 rounded p-2">
                      <strong>How it works:</strong> The AI will ask the caller for their preferred date and time, 
                      check availability (when calendar is connected), and confirm the booking. The appointment 
                      details are saved in the call summary.
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* IVR Navigation Configuration */}
              {action.id === "ivrNavigation" && isEnabled && (
                <Card className="ml-6 border-dashed">
                  <CardContent className="p-4 space-y-4">
                    <h4 className="font-medium text-sm">IVR Navigation Settings</h4>

                    <div className="space-y-2">
                      <Label className="text-xs">Target Navigation (Optional)</Label>
                      <Textarea
                        placeholder="e.g., Select option 2 for Sales, then option 1 for New Accounts"
                        value={config.ivrConfig.targetOption}
                        onChange={(e) => updateConfig("ivrConfig", {
                          ...config.ivrConfig,
                          targetOption: e.target.value
                        })}
                        onClick={(e) => e.stopPropagation()}
                        rows={2}
                        className="text-sm"
                      />
                      <p className="text-xs text-muted-foreground">Tell the AI which menu options to select when navigating a phone tree</p>
                    </div>

                    <div className="text-xs text-muted-foreground bg-blue-500/10 border border-blue-500/20 rounded p-2">
                      <strong>How it works:</strong> When the AI encounters an automated phone system (IVR), it will listen 
                      to the menu options and speak the digit selections clearly. It can navigate multi-level phone trees, 
                      enter extensions, and wait through hold music until reaching a human.
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* End Call - no config needed, just info */}
              {action.id === "endCall" && isEnabled && (
                <Card className="ml-6 border-dashed">
                  <CardContent className="p-4">
                    <div className="text-xs text-muted-foreground bg-blue-500/10 border border-blue-500/20 rounded p-2">
                      <strong>How it works:</strong> The AI will politely wrap up the conversation, summarize any 
                      action items, and say goodbye before ending the call. This ensures calls don&apos;t run indefinitely.
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ReviewStep({ config }: { config: AgentConfig }) {
  const voiceProvider = VOICE_PROVIDERS[config.voiceProvider]
  const voice = voiceProvider.voices.find(v => v.id === config.voiceId)
  const llmProvider = LLM_PROVIDERS[config.llmProvider]
  const model = llmProvider.models.find(m => m.id === config.llmModel)
  const enabledActions = Object.entries(config.actions).filter(([_, enabled]) => enabled).map(([key]) => key)
  
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Review & Create</h2>
        <p className="text-muted-foreground">Review your agent configuration before creating</p>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Bot className="h-4 w-4" />
              Basic Info
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Name</span>
              <span className="font-medium">{config.name}</span>
            </div>
            {config.description && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Description</span>
                <span className="font-medium truncate max-w-[200px]">{config.description}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Mic className="h-4 w-4" />
              Voice
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Provider</span>
              <span className="font-medium">{voiceProvider.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Voice</span>
              <span className="font-medium">{voice?.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Background Noise</span>
              <span className="font-medium">
                {config.backgroundNoise.enabled 
                  ? `${config.backgroundNoise.type.charAt(0).toUpperCase() + config.backgroundNoise.type.slice(1)} (${Math.round(config.backgroundNoise.volume * 100)}%)`
                  : "None"}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Brain className="h-4 w-4" />
              LLM
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Provider</span>
              <span className="font-medium">{llmProvider.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Model</span>
              <span className="font-medium">{model?.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Temperature</span>
              <span className="font-medium">{config.llmSettings.temperature}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Actions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {enabledActions.map(action => (
                <Badge key={action} variant="secondary" className="capitalize">
                  {action.replace(/([A-Z])/g, ' $1').trim()}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Variable className="h-4 w-4" />
              Variables
            </CardTitle>
          </CardHeader>
          <CardContent>
            {config.variables.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {config.variables.filter(v => v.csvColumn).map(variable => (
                  <Badge key={variable.id} variant="outline">
                    {`{{${variable.csvColumn}}}`} → {variable.name || variable.csvColumn}
                  </Badge>
                ))}
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">No variables configured</span>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Opening Message
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs bg-muted p-3 rounded-lg whitespace-pre-wrap">
              {config.openingMessage}
            </pre>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              System Prompt
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs bg-muted p-3 rounded-lg whitespace-pre-wrap max-h-32 overflow-y-auto">
              {config.systemPrompt}
            </pre>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

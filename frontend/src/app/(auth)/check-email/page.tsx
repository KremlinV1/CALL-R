"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Zap, Mail, ArrowRight, Loader2, RefreshCw } from "lucide-react"
import { authApi } from "@/lib/api"
import { useAuthStore } from "@/stores/auth-store"
import { toast } from "sonner"

export default function CheckEmailPage() {
  const router = useRouter()
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)
  const [isResending, setIsResending] = useState(false)

  const handleResend = async () => {
    setIsResending(true)
    try {
      await authApi.resendVerification()
      toast.success("Verification email resent! Check your inbox.")
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to resend"
      toast.error(msg)
    } finally {
      setIsResending(false)
    }
  }

  const handleLogout = () => {
    logout()
    router.push("/login")
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <Card className="border-0 shadow-2xl bg-background/95 backdrop-blur">
        <CardHeader className="text-center pb-2">
          <div className="flex justify-center mb-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
              <Zap className="h-7 w-7 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">Check your email</CardTitle>
          <CardDescription>
            We sent a verification link to{" "}
            <span className="font-medium text-foreground">{user?.email || "your email"}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
            <Mail className="h-10 w-10 text-primary" />
          </div>
          <p className="text-sm text-muted-foreground text-center max-w-sm">
            Click the link in the email to verify your account. If you don&apos;t see it, check your spam folder.
          </p>

          <div className="w-full space-y-3 mt-2">
            <Button onClick={handleResend} variant="outline" className="w-full" disabled={isResending}>
              {isResending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Resending...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Resend verification email
                </>
              )}
            </Button>

            <Button onClick={() => router.push("/dashboard")} className="w-full">
              I&apos;ve verified my email
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>

            <Button variant="ghost" onClick={handleLogout} className="w-full text-muted-foreground">
              Sign out
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

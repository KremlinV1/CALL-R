"use client"

import { Suspense, useEffect, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Zap, CheckCircle2, XCircle, Loader2 } from "lucide-react"
import { authApi } from "@/lib/api"
import { toast } from "sonner"

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>}>
      <VerifyEmailContent />
    </Suspense>
  )
}

function VerifyEmailContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = searchParams.get("token")
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading")
  const [errorMessage, setErrorMessage] = useState("")

  useEffect(() => {
    if (!token) {
      setStatus("error")
      setErrorMessage("No verification token provided.")
      return
    }

    const verify = async () => {
      try {
        await authApi.verifyEmail(token)
        setStatus("success")
        toast.success("Email verified successfully!")
      } catch (err: unknown) {
        setStatus("error")
        setErrorMessage(err instanceof Error ? err.message : "Verification failed")
      }
    }

    verify()
  }, [token])

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
          <CardTitle className="text-2xl font-bold">Email Verification</CardTitle>
          <CardDescription>
            {status === "loading" && "Verifying your email address..."}
            {status === "success" && "Your email has been verified"}
            {status === "error" && "Verification failed"}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          {status === "loading" && (
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
          )}

          {status === "success" && (
            <>
              <CheckCircle2 className="h-16 w-16 text-green-500" />
              <p className="text-sm text-muted-foreground text-center">
                Your email has been verified successfully. You can now access all features.
              </p>
              <Button onClick={() => router.push("/dashboard")} className="w-full mt-2">
                Go to Dashboard
              </Button>
            </>
          )}

          {status === "error" && (
            <>
              <XCircle className="h-16 w-16 text-destructive" />
              <p className="text-sm text-muted-foreground text-center">
                {errorMessage}
              </p>
              <div className="flex gap-2 w-full mt-2">
                <Button variant="outline" onClick={() => router.push("/login")} className="flex-1">
                  Back to Login
                </Button>
                <Button onClick={() => router.push("/check-email")} className="flex-1">
                  Resend Email
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}

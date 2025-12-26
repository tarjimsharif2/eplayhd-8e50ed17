import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { Tv, Mail, Lock, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import OTPVerification from "@/components/OTPVerification";

type AuthStep = "login" | "otp";

interface PendingAuth {
  userId: string;
  email: string;
}

const Auth = () => {
  const { signIn, user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [step, setStep] = useState<AuthStep>("login");
  const [isLoading, setIsLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [otpError, setOtpError] = useState("");
  const [loginData, setLoginData] = useState({ email: '', password: '' });
  const [pendingAuth, setPendingAuth] = useState<PendingAuth | null>(null);
  const [smtpEnabled, setSmtpEnabled] = useState<boolean | null>(null);

  // Check if SMTP is enabled
  useEffect(() => {
    const checkSmtpSettings = async () => {
      try {
        // Use public view to check if SMTP is enabled (without needing admin access)
        const { data } = await supabase
          .from("site_settings_public")
          .select("id")
          .limit(1)
          .single();
        
        // For now, we'll need to check via a function or assume it's enabled if we can't read
        // We'll check during login instead
        setSmtpEnabled(null); // Unknown until login
      } catch {
        setSmtpEnabled(false);
      }
    };
    checkSmtpSettings();
  }, []);

  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      navigate('/admin');
    }
  }, [user, navigate]);

  const sendOTP = async (userId: string, email: string) => {
    const { error } = await supabase.functions.invoke("send-otp", {
      body: { email, userId },
    });
    
    if (error) throw error;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      const { error } = await signIn(loginData.email, loginData.password);
      
      if (error) {
        toast({
          title: "Login failed",
          description: error.message,
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }

      // Get the user after successful sign in
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      
      if (!currentUser) {
        toast({
          title: "Login failed",
          description: "Unable to get user data",
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }

      // Try to send OTP - if SMTP is not configured, skip 2FA
      try {
        await sendOTP(currentUser.id, loginData.email);
        
        // Sign out temporarily until OTP is verified
        await supabase.auth.signOut();
        
        setPendingAuth({ userId: currentUser.id, email: loginData.email });
        setStep("otp");
        
        toast({
          title: "Verification required",
          description: "Check your email for the verification code",
        });
      } catch (otpError: any) {
        // If OTP fails due to SMTP not configured, allow login without 2FA
        if (otpError.message?.includes("SMTP") || otpError.message?.includes("not configured")) {
          toast({
            title: "Welcome back!",
            description: "Logged in successfully (2FA not configured)",
          });
          navigate('/admin');
        } else {
          // Sign out and show error for other OTP failures
          await supabase.auth.signOut();
          toast({
            title: "Verification error",
            description: otpError.message || "Failed to send verification code",
            variant: "destructive",
          });
        }
      }
    } catch (error: any) {
      toast({
        title: "Login failed",
        description: error.message,
        variant: "destructive",
      });
    }
    
    setIsLoading(false);
  };

  const handleVerifyOTP = async (otp: string) => {
    if (!pendingAuth) return;
    
    setIsVerifying(true);
    setOtpError("");
    
    try {
      const { data, error } = await supabase.functions.invoke("verify-otp", {
        body: { userId: pendingAuth.userId, otp },
      });

      if (error || !data?.verified) {
        setOtpError("Invalid or expired verification code");
        setIsVerifying(false);
        return;
      }

      // Re-sign in after OTP verification
      const { error: signInError } = await signIn(loginData.email, loginData.password);
      
      if (signInError) {
        setOtpError("Failed to complete login");
        setIsVerifying(false);
        return;
      }

      toast({
        title: "Welcome back!",
        description: "You've been successfully verified and logged in.",
      });
      navigate('/admin');
    } catch (error: any) {
      setOtpError(error.message || "Verification failed");
    }
    
    setIsVerifying(false);
  };

  const handleResendOTP = async () => {
    if (!pendingAuth) return;
    
    try {
      await sendOTP(pendingAuth.userId, pendingAuth.email);
      toast({
        title: "Code resent",
        description: "A new verification code has been sent to your email",
      });
    } catch (error: any) {
      toast({
        title: "Failed to resend",
        description: error.message || "Could not send verification code",
        variant: "destructive",
      });
    }
  };

  if (user) {
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 flex items-center justify-center py-20">
        {step === "login" ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
            className="w-full max-w-md mx-4"
          >
            <Card>
              <CardHeader className="text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-primary to-pink-500 flex items-center justify-center shadow-lg shadow-primary/30">
                  <Tv className="w-8 h-8 text-primary-foreground" />
                </div>
                <CardTitle className="font-display text-3xl tracking-wider text-gradient">
                  ADMIN LOGIN
                </CardTitle>
                <CardDescription>
                  Sign in to manage matches and content
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="login-email"
                        type="email"
                        placeholder="admin@example.com"
                        className="pl-10"
                        value={loginData.email}
                        onChange={(e) => setLoginData({ ...loginData, email: e.target.value })}
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-password">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="login-password"
                        type="password"
                        placeholder="••••••••"
                        className="pl-10"
                        value={loginData.password}
                        onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                        required
                      />
                    </div>
                  </div>
                  <Button type="submit" variant="gradient" className="w-full" disabled={isLoading}>
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Sign In'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </motion.div>
        ) : (
          <OTPVerification
            email={pendingAuth?.email || ""}
            onVerify={handleVerifyOTP}
            onResend={handleResendOTP}
            isVerifying={isVerifying}
            error={otpError}
          />
        )}
      </main>
      <Footer />
    </div>
  );
};

export default Auth;

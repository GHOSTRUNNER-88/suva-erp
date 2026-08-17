import { Footer } from "@/components/footer";
import { Logo } from "@/components/logo";
import LoginForm from "./login-form";

export const metadata = {
  title: "Log in",
};

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md rounded-3xl border border-primary/25 bg-card p-8 shadow-sm">
          <div className="mb-6 flex justify-center">
            <Logo size={32} />
          </div>
          <LoginForm />
        </div>
      </div>
      <Footer />
    </div>
  );
}

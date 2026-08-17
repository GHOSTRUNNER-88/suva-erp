import { Footer } from "@/components/footer";
import { Logo } from "@/components/logo";
import SignupForm from "./signup-form";

export const metadata = {
  title: "Sign up",
};

export default function SignupPage() {
  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      <div className="flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-xl rounded-3xl border border-primary/25 bg-card p-6 shadow-sm sm:p-7">
          <div className="mb-4 flex justify-center">
            <Logo size={28} />
          </div>
          <SignupForm />
        </div>
      </div>
      <Footer className="shrink-0 py-2" />
    </div>
  );
}

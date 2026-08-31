import { RegisterForm } from "@/app/(auth)/register-form";

export const metadata = { title: "Criar conta" };

export default function RegisterPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <RegisterForm />
    </div>
  );
}

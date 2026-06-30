"use server";

import { signIn } from "@/lib/auth";
import { AuthError } from "next-auth";
import { createLogger } from "@/lib/logger";

const log = createLogger("auth");

export async function loginAdmin(prevState: unknown, formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: "/dashboard",
    });
    return { success: true };
  } catch (error: unknown) {
    // NextAuth redirect triggers a special redirect error that must be thrown to propagate
    if (
      error instanceof Error &&
      (error.message === "NEXT_REDIRECT" || (error as { digest?: string }).digest?.startsWith("NEXT_REDIRECT"))
    ) {
      throw error;
    }
    
    if (error instanceof AuthError) {
      return { error: "Invalid email or password." };
    }
    
    log.error("Login action failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { error: "Invalid email or password." }; // Keep error generic
  }
}

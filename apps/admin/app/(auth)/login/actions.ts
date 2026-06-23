"use server";

import { signIn } from "@/lib/auth";
import { AuthError } from "next-auth";

export async function loginAdmin(prevState: any, formData: FormData) {
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
  } catch (error: any) {
    // NextAuth redirect triggers a special redirect error that must be thrown to propagate
    if (error?.message === "NEXT_REDIRECT" || error?.digest?.startsWith("NEXT_REDIRECT")) {
      throw error;
    }
    
    if (error instanceof AuthError) {
      return { error: "Invalid email or password." };
    }
    
    console.error("Login action error:", error);
    return { error: "Invalid email or password." }; // Keep error generic
  }
}

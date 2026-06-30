"use client";

import { useEffect, useRef } from "react";
import { signOut } from "next-auth/react";

export function IdleTimeout() {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const IDLE_TIME = 15 * 60 * 1000; // 15 minutes in milliseconds

  const resetTimer = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(async () => {
      console.log("Session idle timeout reached. Signing out...");
      try {
        await signOut({ redirectTo: "/login" });
      } catch (err) {
        console.error("SignOut failed:", err);
      }
    }, IDLE_TIME);
  };

  useEffect(() => {
    const events = ["mousedown", "mousemove", "keypress", "scroll", "touchstart"];
    
    resetTimer();

    const handleActivity = () => {
      resetTimer();
    };

    events.forEach((evt) => {
      window.addEventListener(evt, handleActivity);
    });

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      events.forEach((evt) => {
        window.removeEventListener(evt, handleActivity);
      });
    };
  }, []);

  return null;
}

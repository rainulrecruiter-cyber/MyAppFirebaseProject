// src/context/authMethods.js (React Native Version)

// Firebase
import {
    updateProfile,
    signOut,
    signInWithPhoneNumber,
  } from "firebase/auth";
  import { auth, db, functions } from "./firebaseConfig";
  import { httpsCallable } from "firebase/functions";
  import {
    doc,
    setDoc,
    serverTimestamp,
    query,
    where,
    collection,
    getDocs,
  } from "firebase/firestore";
  
  /* ---------------------------
     Centralized auth error mapper
  ---------------------------- */
  export const handleAuthError = (error, defaultMessage) => {
    console.error("Auth Error:", error);
    const map = {
      "auth/invalid-verification-code": "Invalid OTP, please try again.",
      "auth/invalid-verification-id": "Invalid verification, please retry.",
      "auth/too-many-requests": "Too many attempts. Please try again later.",
      "auth/operation-not-allowed": "Phone sign-in not enabled.",
      "auth/user-disabled": "This account has been disabled.",
      "auth/code-expired": "OTP expired. Please request a new one.",
      "permission-denied": "Permission denied when accessing Firestore.",
    };
    return {
      success: false,
      error: map[error?.code] || defaultMessage || "Authentication failed.",
    };
  };
  
  /* ---------------------------
     utils: normalize phone
  ---------------------------- */
  export const normalizePhone = (phone) => {
    if (!phone) return phone;
    let s = String(phone).trim().replace(/[\s().-]/g, "");
    if (s.startsWith("+")) return s;
    if (s.length > 10 && s.startsWith("91")) return "+" + s;
    if (/^\d{10}$/.test(s)) return "+91" + s;
    return s;
  };
  
  /* ---------------------------
     checkUserExists (via callable)
  ---------------------------- */
  export const checkUserExists = async (phoneNumber) => {
    try {
      const normalized = normalizePhone(phoneNumber);
  
      if (functions) {
        const fn = httpsCallable(functions, "checkUserExists");
        const res = await fn({ phone: normalized });
        return Boolean(res?.data?.exists);
      }
  
      // fallback if callable unavailable
      const q = query(collection(db, "users"), where("phone", "==", normalized));
      const snaps = await getDocs(q);
      return !snaps.empty;
    } catch (e) {
      console.error("checkUserExists error", e);
      throw e;
    }
  };
  
  /* ---------------------------
     Recaptcha (NOT USED IN RN)
  ---------------------------- */
  export const setUpRecaptcha = async () => {
    throw new Error(
      "RecaptchaVerifier is web-only. For React Native, use Expo Firebase Phone Auth flow."
    );
  };
  
  /* ---------------------------
     signUpWithPhone (RN)
  ---------------------------- */
  export const signUpWithPhone = async (
    phoneNumber,
    name = "",
    { setPendingSignup, setConfirmationResult } = {}
  ) => {
    try {
      const phone = normalizePhone(phoneNumber);
      const exists = await checkUserExists(phone);
  
      if (exists) {
        return {
          success: false,
          error: "Phone already registered. Please sign in instead.",
        };
      }
  
      // Developer must handle RN phone auth
      const confirmation = await signInWithPhoneNumber(auth, phone);
  
      setConfirmationResult?.(confirmation);
      setPendingSignup?.({
        phone,
        name: name?.trim() || `Guest-${phone.slice(-4)}`,
      });
  
      return {
        success: true,
        message: "OTP sent for signup. Enter the code to complete registration.",
      };
    } catch (error) {
      console.error("signUpWithPhone error:", error);
      return handleAuthError(error, "Failed to send OTP for signup.");
    }
  };
  
  /* ---------------------------
     signInWithPhone (RN)
  ---------------------------- */
  export const signInWithPhone = async (
    phoneNumber,
    { setPendingSignup, setConfirmationResult } = {}
  ) => {
    try {
      const phone = normalizePhone(phoneNumber);
      const exists = await checkUserExists(phone);
  
      if (!exists) {
        return {
          success: false,
          error: "No account found for this phone number. Please sign up.",
        };
      }
  
      setPendingSignup?.(null);
  
      const confirmation = await signInWithPhoneNumber(auth, phone);
      setConfirmationResult?.(confirmation);
  
      return { success: true, message: "OTP sent successfully." };
    } catch (error) {
      console.error("signInWithPhone error:", error);
      return handleAuthError(error, "Failed to send OTP.");
    }
  };
  
  /* ---------------------------
     verifyOTP (RN)
  ---------------------------- */
  export const verifyOTP = async (
    confirmation,
    otp,
    {
      confirmationResult,
      pendingSignup,
      setPendingSignup,
      setConfirmationResult,
      setUser,
    } = {}
  ) => {
    try {
      const conf = confirmation || confirmationResult;
      if (!conf) {
        return {
          success: false,
          error: "No OTP request found. Please request a new code.",
        };
      }
  
      const result = await conf.confirm(otp);
      const phoneUser = result.user;
  
      const defaultName =
        phoneUser?.displayName?.trim() ||
        (pendingSignup?.name || "").trim() ||
        `Guest-${(phoneUser.phoneNumber || "").slice(-4)}`;
  
      try {
        await updateProfile(phoneUser, { displayName: defaultName });
      } catch (e) {
        console.error("updateProfile error:", e);
      }
  
      phoneUser.displayName = defaultName;
      setUser?.(phoneUser);
  
      await setDoc(
        doc(db, "users", phoneUser.uid),
        {
          name: defaultName,
          email: phoneUser.email || "",
          phone: phoneUser.phoneNumber || "",
          joinDate: new Date().toLocaleDateString("en-IN"),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
  
      setPendingSignup?.(null);
      setConfirmationResult?.(null);
  
      return {
        success: true,
        message: pendingSignup
          ? "Signup complete. Logged in."
          : "Phone sign-in successful.",
        user: phoneUser,
      };
    } catch (error) {
      console.error("verifyOTP error:", error);
      return handleAuthError(error, "Invalid OTP, please try again.");
    }
  };
  
  export const verifyOtp = async (otp, helpers = {}) =>
    verifyOTP(null, otp, helpers);
  
  /* ---------------------------
     Google sign in (NOT WEB POPUP)
  ---------------------------- */
  export const signInWithGoogle = async () => {
    throw new Error(
      "Google sign-in via popup is web-only. Use Expo Google Authentication for React Native."
    );
  };
  
  /* ---------------------------
     Logout (RN, no navigation)
  ---------------------------- */
  export const logout = async (
    _navigateUnused,
    {
      setUser,
      setAuthUser,
      setAdmin,
      setAllowedCategories,
      setConfirmationResult,
      setPendingSignup,
    } = {}
  ) => {
    try {
      await signOut(auth);
  
      setUser?.(null);
      setAuthUser?.(null);
      setAdmin?.(null);
      setAllowedCategories?.([]);
      setConfirmationResult?.(null);
      setPendingSignup?.(null);
  
      return { success: true, message: "Logged out successfully" };
    } catch (error) {
      return handleAuthError(error, "Logout failed");
    }
  };
  
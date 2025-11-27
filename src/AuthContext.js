// src/context/AuthContext.js
import React, { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, updateProfile } from "firebase/auth";
import { auth, db } from "./firebaseConfig";
import { doc, getDoc, getDocs, collection } from "firebase/firestore";

// authMethods (same imports as your web version)
import {
  setUpRecaptcha as setUpRecaptchaMethod,
  signUpWithPhone as signUpWithPhoneMethod,
  signInWithPhone as signInWithPhoneMethod,
  verifyOTP as verifyOTPMethod,
  verifyOtp as verifyOtpMethodSimple,
  signInWithGoogle as signInWithGoogleMethod,
  logout as logoutMethod,
} from "./authMethods";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null); // public/customer user
  const [authUser, setAuthUser] = useState(null); // raw firebase user
  const [admin, setAdmin] = useState(null); // admin profile
  const [allowedCategories, setAllowedCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  // OTP states
  const [confirmationResult, setConfirmationResult] = useState(null);
  const [pendingSignup, setPendingSignup] = useState(null);

  // ---------------------------
  // Recaptcha wrapper
  // ---------------------------
  const setUpRecaptcha = async (phoneNumber, containerId = "recaptcha-container") => {
    try {
      const confirmation = await setUpRecaptchaMethod(phoneNumber, containerId);
      setConfirmationResult(confirmation);
      return confirmation;
    } catch (error) {
      throw error;
    }
  };

  // ---------------------------
  // Sign Up phone wrapper
  // ---------------------------
  const signUpWithPhone = async (phoneNumber, name = "") => {
    return await signUpWithPhoneMethod(phoneNumber, name, {
      setPendingSignup,
      setConfirmationResult,
    });
  };

  // ---------------------------
  // Sign In phone wrapper
  // ---------------------------
  const signInWithPhone = async (phoneNumber) => {
    return await signInWithPhoneMethod(phoneNumber, {
      setPendingSignup,
      setConfirmationResult,
    });
  };

  // ---------------------------
  // Verify OTP
  // ---------------------------
  const verifyOTP = async (confirmation, otp) =>
    verifyOTPMethod(confirmation, otp, {
      confirmationResult,
      pendingSignup,
      setPendingSignup,
      setConfirmationResult,
      setUser,
    });

  const verifyOtp = async (otp) => verifyOTP(null, otp);

  // ---------------------------
  // Google sign-in wrapper
  // ---------------------------
  const signInWithGoogle = async () => {
    return await signInWithGoogleMethod(setUser);
  };

  // ---------------------------
  // Logout wrapper (NO navigation, RN handles navigation externally)
  // ---------------------------
  const logout = async () => {
    return await logoutMethod(null, {
      setUser,
      setAuthUser,
      setAdmin,
      setAllowedCategories,
      setConfirmationResult,
      setPendingSignup,
    });
  };

  // ---------------------------
  // Load admin Firestore doc
  // ---------------------------
  const loadAdminDoc = async (uid) => {
    if (!uid) {
      setAdmin(null);
      setAllowedCategories([]);
      return;
    }
    try {
      const snap = await getDoc(doc(db, "admins", uid));
      if (!snap.exists()) {
        setAdmin(null);
        setAllowedCategories([]);
        return;
      }

      const data = snap.data() || {};
      const role = String(data.role || "admin").trim().toLowerCase();

      let categories = [];

      if (role === "superadmin") {
        const allAdmins = await getDocs(collection(db, "admins"));
        const merged = allAdmins.docs.flatMap((d) => {
          const a = d.data() || {};
          if (Array.isArray(a.categories)) return a.categories;
          if (a.category) return [a.category];
          return [];
        });

        categories = [
          ...new Set(
            merged.map((c) => String(c || "").trim().toLowerCase()).filter(Boolean)
          ),
        ];
      } else {
        const rawCategories = Array.isArray(data.categories)
          ? data.categories
          : data.category
          ? [data.category]
          : [];

        categories = rawCategories
          .map((c) => String(c || "").trim().toLowerCase())
          .filter(Boolean);
      }

      setAdmin({
        active: !!data.active,
        categories,
        role,
        email: data.email || "",
      });

      setAllowedCategories(categories);
    } catch (e) {
      console.error("Failed to load admin doc:", e);
      setAdmin(null);
      setAllowedCategories([]);
    }
  };

  // ---------------------------
  // Auth state listener
  // ---------------------------
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      try {
        setAuthUser(currentUser || null);

        if (currentUser && (currentUser.email || currentUser.phoneNumber)) {
          let displayName = currentUser.displayName;

          // Load displayName from Firestore if missing
          if (!displayName) {
            try {
              const userDoc = await getDoc(doc(db, "users", currentUser.uid));
              if (userDoc.exists()) {
                const ud = userDoc.data() || {};
                displayName = ud.name || displayName;

                // Patch missing phoneNumber
                if (!currentUser.phoneNumber && ud.phone) {
                  try {
                    currentUser.phoneNumber = ud.phone;
                  } catch (e) {}
                }

                if (displayName) {
                  try {
                    await updateProfile(currentUser, { displayName });
                  } catch (e) {
                    console.error("updateProfile error:", e);
                  }
                }
              }
            } catch (e) {
              console.error("Failed fetching user doc:", e);
            }
          }

          try {
            if (displayName) currentUser.displayName = displayName;
          } catch (e) {}

          setUser(currentUser);
          await loadAdminDoc(currentUser.uid);
        } else {
          setUser(null);
          setAdmin(null);
        }
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // ---- Helpers ----
  const isSuperAdmin = admin?.role === "superadmin";
  const hasRole = (requiredRole) =>
    !requiredRole ||
    isSuperAdmin ||
    admin?.role === String(requiredRole).toLowerCase();

  const canManageCategory = (cat) =>
    !!(
      admin?.active &&
      (isSuperAdmin ||
        admin?.categories?.includes(String(cat || "").toLowerCase()))
    );

  const refreshAdminProfile = async () => {
    if (auth.currentUser) await loadAdminDoc(auth.currentUser.uid);
  };

  const userRole = admin?.role || "user";

  return (
    <AuthContext.Provider
      value={{
        user,
        authUser,
        admin,
        allowedCategories,
        loading,
        isSuperAdmin,
        hasRole,
        canManageCategory,
        refreshAdminProfile,
        userRole,

        signInWithGoogle,
        logout,

        setUpRecaptcha,
        signUpWithPhone,
        signInWithPhone,
        verifyOTP,
        verifyOtp,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

// src/screens/AdminLoginScreen.js
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
} from "react-native";
import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
} from "firebase/auth";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { auth, db } from "../firebaseConfig";
import { useNavigation } from "@react-navigation/native";

export default function AdminLoginScreen() {
  const nav = useNavigation();

  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  // If already signed in, verify admin and redirect
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) return;
      try {
        const ok = await isActiveAdmin(u.uid, u.email || "");
        if (ok) {
          nav.replace("AdminHome");
        } else {
          setErr("This account is not authorized as an admin.");
          await signOut(auth);
        }
      } catch {
        setErr("Failed to verify admin access.");
      }
    });
    return () => unsub();
  }, [nav]);

  const isActiveAdmin = async (uid, email) => {
    // Prefer UID doc
    const s = await getDoc(doc(db, "admins", uid));
    if (s.exists() && !!s.data()?.active) return true;

    // Backward compatible
    if (email) {
      const qy = query(
        collection(db, "admins"),
        where("email", "==", email),
        where("active", "==", true)
      );
      const qs = await getDocs(qy);
      if (!qs.empty) return true;
    }
    return false;
  };

  const handleLogin = async () => {
    setErr("");
    setLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, pwd);
      const ok = await isActiveAdmin(cred.user.uid, cred.user.email || "");
      if (ok) {
        nav.replace("AdminHome");
      } else {
        await signOut(auth);
        setErr("This account is not authorized as an admin.");
      }
    } catch (e2) {
      setErr(e2?.message || "Failed to sign in.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.page}>
      <View style={styles.card}>
        <Text style={styles.title}>Admin Login</Text>
        <Text style={styles.subtitle}>Sign in to access your dashboard</Text>

        {err ? <Text style={styles.errorBox}>{err}</Text> : null}

        <View style={{ marginTop: 20, gap: 14 }}>
          {/* Email Input */}
          <View style={{ gap: 6 }}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="admin@yourstore.com"
              placeholderTextColor="#687387"
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
            />
          </View>

          {/* Password Input */}
          <View style={{ gap: 6 }}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              placeholder="••••••••"
              placeholderTextColor="#687387"
              secureTextEntry
              value={pwd}
              onChangeText={setPwd}
            />
          </View>

          {/* Login Button */}
          <TouchableOpacity
            onPress={handleLogin}
            disabled={loading}
            style={styles.loginBtn}
          >
            <Text style={styles.loginBtnText}>
              {loading ? "Signing in…" : "Sign in"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Back to Store */}
        <TouchableOpacity
          style={{ marginTop: 16 }}
          onPress={() => nav.navigate("Home")}
        >
          <Text style={styles.backLink}>← Back to Store</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: "#0b0d12",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#121620",
    borderColor: "#1f2430",
    borderWidth: 1,
    borderRadius: 16,
    padding: 24,
  },
  title: {
    color: "#eaecee",
    fontSize: 24,
    fontWeight: "700",
  },
  subtitle: {
    marginTop: 6,
    color: "#9aa3b2",
  },
  errorBox: {
    backgroundColor: "#2c1f1f",
    color: "#ffb4b4",
    borderColor: "#6b2b2b",
    borderWidth: 1,
    padding: 10,
    marginTop: 14,
    borderRadius: 10,
  },
  label: {
    color: "#b9c1cf",
    fontSize: 14,
  },
  input: {
    backgroundColor: "#0f131c",
    borderWidth: 1,
    borderColor: "#283042",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#eaecee",
  },
  loginBtn: {
    backgroundColor: "#6c5ce7",
    borderRadius: 12,
    paddingVertical: 12,
    marginTop: 4,
    alignItems: "center",
  },
  loginBtnText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "500",
  },
  backLink: {
    color: "#9aa3b2",
    textAlign: "center",
  },
});

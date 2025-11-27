// src/screens/AdminBookingScreen.js
import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Modal,
  StyleSheet,
  ScrollView,
} from "react-native";
import {
  collection,
  onSnapshot,
  query,
  updateDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebaseConfig";
import { useAuth } from "../AuthContext";
import { useNavigation } from "@react-navigation/native";
import { Picker } from "@react-native-picker/picker";

// Valid statuses admins can pick from the dropdown
const STATUSES = ["Cancelled", "Returned"];

// Helper to render a colored badge for refundStatus (React Native version)
const renderRefundBadge = (status) => {
  if (!status) return null;
  let bg = "#6b7280"; // gray default
  if (status === "processed") bg = "#16a34a";
  else if (status === "queued") bg = "#f59e0b";
  else if (status === "failed") bg = "#dc2626";

  return (
    <View style={[styles.refundBadge, { backgroundColor: bg }]}>
      <Text style={styles.refundBadgeText}>{status}</Text>
    </View>
  );
};

export default function AdminBooking() {
  const { admin, isSuperAdmin } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [shopFilter, setShopFilter] = useState("all");
  const [allShops, setAllShops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmData, setConfirmData] = useState(null);
  const [message, setMessage] = useState("");
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [actionValue, setActionValue] = useState("");
  const navigation = useNavigation();

  const normalize = (str) => String(str || "").trim().toLowerCase();

  // -------------------------------------------------------------------------
  // Subscribe to bookings (real-time)
  useEffect(() => {
    const q = query(collection(db, "bookings"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = [];
        snap.forEach((d) => list.push({ docId: d.id, ...d.data() }));
        list.sort((a, b) => {
          const ta = a.createdAt?.seconds || 0;
          const tb = b.createdAt?.seconds || 0;
          return tb - ta;
        });
        setBookings(list);
        setLoading(false);
      },
      (err) => {
        console.error("bookings listener error:", err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  // -------------------------------------------------------------------------
  // Collect unique shop names for superadmin dropdown
  useEffect(() => {
    if (!isSuperAdmin) return;
    const shops = new Set();
    bookings.forEach((b) => {
      if (b.shop) shops.add(b.shop);
    });
    setAllShops([...shops].sort());
  }, [bookings, isSuperAdmin]);

  // -------------------------------------------------------------------------
  // Determine whether a booking is visible to current admin (based on assigned shop)
  const inMyShops = (booking) => {
    if (isSuperAdmin) return true;
    if (!admin?.categories?.length) return false;
    const myShop = normalize(admin.categories[0] || "");
    const bookingShop = normalize(booking.shop || "");
    return bookingShop === myShop;
  };

  const visibleBookings = useMemo(
    () => bookings.filter(inMyShops),
    [bookings, admin, isSuperAdmin]
  );

  // -------------------------------------------------------------------------
  // Filtered bookings (search + status + shop filter)
  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return visibleBookings.filter((b) => {
      const matchText =
        !f ||
        (b.customerName && b.customerName.toLowerCase().includes(f)) ||
        (b.customerPhone && b.customerPhone.toLowerCase().includes(f)) ||
        (b.customerEmail && b.customerEmail.toLowerCase().includes(f));

      const matchStatus = statusFilter === "all" || b.status === statusFilter;

      let matchShop = true;
      if (isSuperAdmin && shopFilter !== "all") {
        const bshop = normalize(b.shop || "");
        matchShop = bshop === normalize(shopFilter);
      }

      return matchText && matchStatus && matchShop;
    });
  }, [visibleBookings, filter, statusFilter, shopFilter, isSuperAdmin]);

  // -------------------------------------------------------------------------
  // Update booking status (with refund handling for 'Returned')
  const updateStatus = async () => {
    if (!confirmData) return;
    setSelectedBooking(null);
    try {
      const bookingRef = doc(db, "bookings", confirmData.docId);
      const booking = bookings.find((b) => b.docId === confirmData.docId);
      if (!booking) throw new Error("Booking not found");

      if (confirmData.newStatus === "Returned") {
        const paymentId = booking?.paymentId || booking?.razorpay_payment_id;
        if (!paymentId) {
          await updateDoc(bookingRef, {
            refundStatus: "failed",
            updatedAt: serverTimestamp(),
          });
          throw new Error("No Razorpay payment ID found for this booking");
        }

        setMessage("Processing refund...");

        // Expo env-style base URL; configure EXPO_PUBLIC_API_BASE_URL in app
        const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

        const res = await fetch(`${API_BASE_URL}/refundPayment`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            razorpay_payment_id: paymentId,
            amount: Number(booking.total),
          }),
        });

        let data = null;
        try {
          data = await res.json();
        } catch (err) {
          throw new Error("Invalid response from refund endpoint");
        }

        if (data && data.success) {
          await updateDoc(bookingRef, {
            status: "Returned",
            refundStatus: data.refund?.status || "processed",
            refundId: data.refund?.id || null,
            updatedAt: serverTimestamp(),
          });
          setMessage("✅ Booking refunded & updated to Returned");
        } else if (data && data.refundQueued) {
          await updateDoc(bookingRef, {
            status: "Returned",
            refundStatus: "queued",
            updatedAt: serverTimestamp(),
          });
          setMessage("⏳ Refund queued — Razorpay will process later");
        } else {
          await updateDoc(bookingRef, {
            refundStatus: "failed",
            updatedAt: serverTimestamp(),
          });
          throw new Error(data?.message || "Refund failed");
        }
      } else {
        await updateDoc(bookingRef, {
          status: confirmData.newStatus,
          updatedAt: serverTimestamp(),
        });
        setMessage(`✅ Booking updated to "${confirmData.newStatus}"`);
      }

      setTimeout(() => setMessage(""), 3000);
    } catch (e) {
      console.error("updateStatus error:", e);
      setMessage("❌ Failed: " + (e.message || e));
      setTimeout(() => setMessage(""), 4000);
    } finally {
      setConfirmData(null);
    }
  };

  // -------------------------------------------------------------------------
  // Date formatting helper
  const formatCreatedAt = (ts) => {
    try {
      if (!ts) return "—";
      if (ts.toDate)
        return ts
          .toDate()
          .toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          });
      const d = new Date(ts);
      return isNaN(d.getTime())
        ? "—"
        : d.toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          });
    } catch {
      return "—";
    }
  };

  // -------------------------------------------------------------------------
  // Render single booking card (instead of table row)
  const renderBookingItem = ({ item: b, index }) => {
    return (
      <View style={styles.bookingCard}>
        {/* Booking header */}
        <View style={styles.bookingHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.orderId}>
              {`Booking-${filtered.length - index}`}
            </Text>
            <Text style={styles.mutedText}>Ref: {b.ref || b.docId}</Text>
            <Text style={styles.mutedText}>UID: {b.uid || "—"}</Text>
          </View>
          <View style={styles.dateBox}>
            <Text style={styles.dateBoxDate}>{formatCreatedAt(b.createdAt)}</Text>
            <Text style={styles.dateBoxTime}>
              {b.createdAt?.toDate
                ? b.createdAt
                    .toDate()
                    .toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                : ""}
            </Text>
          </View>
        </View>

        {/* Customer & contact */}
        <View style={styles.row}>
          <View style={styles.rowItem}>
            <Text style={styles.label}>Customer</Text>
            <Text style={styles.value}>{b.customerName || "—"}</Text>
          </View>
          <View style={styles.rowItem}>
            <Text style={styles.label}>Contact</Text>
            <Text style={styles.value}>{b.customerPhone || "—"}</Text>
          </View>
        </View>

        {/* Shop / Barber */}
        <View style={styles.row}>
          <View style={styles.rowItem}>
            <Text style={styles.label}>Shop / Barber</Text>
            <Text style={styles.value}>
              {(b.shop || "—") + " / " + (b.barber || "—")}
            </Text>
          </View>
        </View>

        {/* Services */}
        <View style={styles.row}>
          <View style={styles.rowItem}>
            <Text style={styles.label}>Services</Text>
            <Text style={styles.value}>
              {Array.isArray(b.serviceDetails) && b.serviceDetails.length > 0
                ? b.serviceDetails.map((s) => s.name).join(", ")
                : Array.isArray(b.service)
                ? b.service.join(", ")
                : "—"}
            </Text>
          </View>
        </View>

        {/* Status + refund badge + View button */}
        <View style={styles.statusRow}>
          <View style={styles.statusLeft}>
            <View style={styles.pickerWrapperSmall}>
              <Picker
                enabled={b.status !== "Returned"}
                selectedValue={b.status || ""}
                onValueChange={(val) => {
                  if (!val) return;
                  setSelectedBooking(null);
                  setConfirmData({ docId: b.docId, newStatus: val });
                }}
                dropdownIconColor="#eaecee"
                style={styles.statusPicker}
              >
                <Picker.Item label="Select status" value="" />
                {STATUSES.map((s) => (
                  <Picker.Item key={s} label={s} value={s} />
                ))}
              </Picker>
            </View>
            {renderRefundBadge(b.refundStatus)}
          </View>

          <TouchableOpacity
            style={[styles.button, styles.buttonSmall]}
            onPress={() => {
              setConfirmData(null);
              setSelectedBooking(b);
            }}
          >
            <Text style={styles.buttonText}>View</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // -------------------------------------------------------------------------
  // RENDER
  return (
    <View style={styles.page}>
      {/* Topbar */}
      <View style={styles.topbar}>
        <Text style={styles.brand}>
          <Text style={{ fontWeight: "700" }}>Cake Shop</Text> Admin — Bookings
        </Text>
      </View>

      <View style={styles.container}>
        {/* Filters */}
        <View style={styles.filters}>
          <View style={styles.filtersLeft}>
            <View style={styles.filtersRow}>
              <TextInput
                style={styles.input}
                placeholder="Search by name, phone, email…"
                placeholderTextColor="#687387"
                value={filter}
                onChangeText={setFilter}
              />

              {/* Status Filter */}
              <View style={styles.pickerWrapper}>
                <Picker
                  selectedValue={statusFilter}
                  onValueChange={(v) => setStatusFilter(v)}
                  dropdownIconColor="#eaecee"
                  style={styles.dropdown}
                >
                  <Picker.Item label="All statuses" value="all" />
                  {STATUSES.map((s) => (
                    <Picker.Item key={s} label={s} value={s} />
                  ))}
                </Picker>
              </View>

              {/* Shop Filter */}
              {isSuperAdmin ? (
                <View style={styles.pickerWrapper}>
                  <Picker
                    selectedValue={shopFilter}
                    onValueChange={(v) => setShopFilter(v)}
                    dropdownIconColor="#eaecee"
                    style={styles.dropdown}
                  >
                    <Picker.Item label="All Shops" value="all" />
                    {allShops.map((s) => (
                      <Picker.Item key={s} label={s} value={s} />
                    ))}
                  </Picker>
                </View>
              ) : (
                admin?.categories?.length > 0 && (
                  <View style={styles.pickerWrapper}>
                    <Picker
                      enabled={false}
                      selectedValue={admin.categories[0] || "Assigned Shop"}
                      onValueChange={() => {}}
                      dropdownIconColor="#eaecee"
                      style={styles.dropdown}
                    >
                      <Picker.Item
                        label={admin.categories[0] || "Assigned Shop"}
                        value={admin.categories[0] || "Assigned Shop"}
                      />
                    </Picker>
                  </View>
                )
              )}
            </View>

            {/* Action Select */}
            <View style={styles.pickerWrapper}>
              <Picker
                selectedValue={actionValue}
                onValueChange={(val) => {
                  setActionValue(val);
                  if (val) {
                    // Expect screens registered with these names
                    navigation.navigate(val);
                  }
                }}
                dropdownIconColor="#eaecee"
                style={styles.dropdown}
              >
                <Picker.Item label="Select Action" value="" />
                <Picker.Item
                  label="Add Booking Item"
                  value="/admin/add-booking-item"
                />
                <Picker.Item
                  label="Booking List"
                  value="/admin/BookingFormList"
                />
                <Picker.Item label="Slider" value="/admin/add-slider" />
                <Picker.Item
                  label="Home Services"
                  value="/admin/BookingHomepageServices"
                />
                <Picker.Item label="Gallery" value="/admin/Bookinggallery" />
                <Picker.Item label="Contact" value="/admin/ContactUs" />
                <Picker.Item label="AboutUs" value="/admin/AboutUs" />
              </Picker>
            </View>
          </View>
        </View>

        {/* Booking List */}
        <View style={styles.listWrap}>
          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" />
            </View>
          ) : filtered.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>No bookings found.</Text>
            </View>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.docId}
              renderItem={renderBookingItem}
              contentContainerStyle={styles.listContent}
            />
          )}
        </View>

        {/* Status message */}
        {message ? (
          <View style={styles.statusMessage}>
            <Text style={styles.statusMessageText}>{message}</Text>
          </View>
        ) : null}
      </View>

      {/* Confirmation Popup */}
      <Modal
        visible={!!confirmData}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmData(null)}
      >
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmPopup}>
            {confirmData && (
              <Text style={styles.confirmText}>
                Update booking to{" "}
                <Text style={{ fontWeight: "700" }}>
                  {confirmData.newStatus}
                </Text>
                ?
              </Text>
            )}
            <View style={styles.confirmButtons}>
              <TouchableOpacity
                onPress={updateStatus}
                style={styles.btnConfirm}
              >
                <Text style={styles.btnConfirmText}>Yes, Update</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setConfirmData(null)}
                style={styles.btnCancel}
              >
                <Text style={styles.btnCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Booking Details Modal */}
      <Modal
        visible={!!selectedBooking}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedBooking(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>📅 Booking Details</Text>
              <TouchableOpacity
                onPress={() => setSelectedBooking(null)}
                style={styles.closeButton}
              >
                <Text style={styles.closeButtonText}>Close</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              style={{ marginTop: 20 }}
              contentContainerStyle={{ paddingBottom: 10 }}
            >
              {selectedBooking && (
                <View style={{ gap: 18 }}>
                  {/* Location / Shop / Barber + Customer info */}
                  <View style={[styles.sectionCard, styles.grid2]}>
                    <View style={{ gap: 6 }}>
                      <Text style={styles.sectionText}>
                        <Text style={styles.sectionStrong}>📍 Location:</Text>{" "}
                        {selectedBooking.location || "—"}
                      </Text>
                      <Text style={styles.sectionText}>
                        <Text style={styles.sectionStrong}>🏬 Shop:</Text>{" "}
                        {selectedBooking.shop || "—"}
                      </Text>
                      <Text style={styles.sectionText}>
                        <Text style={styles.sectionStrong}>💇 Barber:</Text>{" "}
                        {selectedBooking.barber || "—"}
                      </Text>
                    </View>
                    <View style={{ gap: 6 }}>
                      <Text style={styles.sectionText}>
                        <Text style={styles.sectionStrong}>👤 Customer:</Text>{" "}
                        {selectedBooking.customerName || "—"}
                      </Text>
                      <Text style={styles.sectionText}>
                        <Text style={styles.sectionStrong}>📞 Phone:</Text>{" "}
                        {selectedBooking.customerPhone || "—"}
                      </Text>
                      {selectedBooking.customerEmail ? (
                        <Text style={styles.sectionText}>
                          <Text style={styles.sectionStrong}>✉️ Email:</Text>{" "}
                          {selectedBooking.customerEmail}
                        </Text>
                      ) : null}
                    </View>
                  </View>

                  {/* Services */}
                  <View style={styles.sectionCard}>
                    <Text style={styles.sectionTitle}>💆 Services</Text>
                    {Array.isArray(selectedBooking.serviceDetails) &&
                    selectedBooking.serviceDetails.length > 0 ? (
                      <View>
                        {selectedBooking.serviceDetails.map((svc, idx) => (
                          <Text
                            key={idx}
                            style={styles.sectionListItem}
                          >{`${svc.name} — ⏱ ${svc.duration} mins — ₹${svc.price}`}</Text>
                        ))}
                        <Text style={styles.sectionStrongText}>
                          Total Services:{" "}
                          {selectedBooking.serviceDetails.length}
                        </Text>
                      </View>
                    ) : Array.isArray(selectedBooking.service) &&
                      selectedBooking.service.length > 0 ? (
                      <View>
                        {selectedBooking.service.map((id, idx) => (
                          <Text key={idx} style={styles.sectionListItem}>
                            {id}
                          </Text>
                        ))}
                      </View>
                    ) : (
                      <Text style={styles.sectionText}>—</Text>
                    )}
                  </View>

                  {/* Date / Duration / Start / End */}
                  <View style={[styles.sectionCard, styles.grid2]}>
                    <Text style={styles.sectionText}>
                      <Text style={styles.sectionStrong}>📅 Date:</Text>{" "}
                      {selectedBooking.date || "—"}
                    </Text>
                    <Text style={styles.sectionText}>
                      <Text style={styles.sectionStrong}>⏱ Duration:</Text>{" "}
                      {selectedBooking.duration
                        ? `${selectedBooking.duration} mins`
                        : "—"}
                    </Text>
                    <Text style={styles.sectionText}>
                      <Text style={styles.sectionStrong}>🕒 Start:</Text>{" "}
                      {selectedBooking.start || "—"}
                    </Text>
                    <Text style={styles.sectionText}>
                      <Text style={styles.sectionStrong}>🕔 End:</Text>{" "}
                      {selectedBooking.end || "—"}
                    </Text>
                  </View>

                  {/* Payment */}
                  <View style={styles.sectionCard}>
                    <Text style={styles.sectionTitle}>💳 Payment</Text>
                    <Text style={styles.sectionText}>
                      <Text style={styles.sectionStrong}>Total Amount:</Text>{" "}
                      ₹{selectedBooking.total ?? 0}
                    </Text>
                    {selectedBooking.refundStatus ? (
                      <View style={{ flexDirection: "row", marginTop: 6 }}>
                        <Text style={styles.sectionStrong}>Refund Status: </Text>
                        {renderRefundBadge(selectedBooking.refundStatus)}
                      </View>
                    ) : null}
                    {selectedBooking.refundId ? (
                      <Text style={styles.sectionText}>
                        <Text style={styles.sectionStrong}>Refund ID:</Text>{" "}
                        {selectedBooking.refundId}
                      </Text>
                    ) : null}
                  </View>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: "#0b0d12",
  },
  topbar: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#1f2430",
  },
  brand: {
    color: "#eaecee",
    letterSpacing: 0.2,
  },
  container: {
    flex: 1,
    padding: 20,
  },
  // Filters
  filters: {
    marginBottom: 16,
  },
  filtersLeft: {
    flexDirection: "column",
    gap: 12,
  },
  filtersRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  input: {
    flex: 1,
    minHeight: 44,
    backgroundColor: "#0f131c",
    borderWidth: 1,
    borderColor: "#283042",
    borderRadius: 10,
    paddingHorizontal: 12,
    color: "#eaecee",
  },
  pickerWrapper: {
    minWidth: 160,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "#1f2937",
  },
  pickerWrapperSmall: {
    width: 160,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#0f131c",
    borderWidth: 1,
    borderColor: "#283042",
  },
  dropdown: {
    height: 44,
    color: "#ffffff",
  },
  statusPicker: {
    height: 40,
    color: "#eaecee",
    fontSize: 14,
  },
  // List
  listWrap: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: "#121620",
    borderWidth: 1,
    borderColor: "#1f2430",
  },
  listContent: {
    padding: 12,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  emptyWrap: {
    paddingVertical: 32,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyText: {
    color: "#9aa3b2",
  },
  // Booking card
  bookingCard: {
    backgroundColor: "#0b0d12",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1f2430",
    padding: 12,
    marginBottom: 10,
  },
  bookingHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
    gap: 12,
  },
  orderId: {
    fontFamily: "monospace",
    fontSize: 12,
    color: "#eaecee",
  },
  mutedText: {
    fontSize: 12,
    color: "#9aa3b2",
  },
  dateBox: {
    backgroundColor: "#dc3545",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minWidth: 110,
    justifyContent: "center",
    alignItems: "center",
  },
  dateBoxDate: {
    color: "#ffffff",
    fontWeight: "600",
    fontSize: 13,
  },
  dateBoxTime: {
    color: "#ffffff",
    fontSize: 12,
  },
  row: {
    flexDirection: "row",
    marginTop: 8,
  },
  rowItem: {
    flex: 1,
  },
  label: {
    fontSize: 12,
    color: "#9aa3b2",
    marginBottom: 2,
  },
  value: {
    fontSize: 14,
    color: "#eaecee",
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
  },
  statusLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  refundBadge: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 6,
    marginLeft: 8,
  },
  refundBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#ffffff",
    textTransform: "capitalize",
  },
  button: {
    backgroundColor: "#21293a",
    borderWidth: 1,
    borderColor: "#2d364a",
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  buttonSmall: {
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  buttonText: {
    color: "#eaecee",
    fontSize: 12,
  },
  // Status message
  statusMessage: {
    marginTop: 12,
    marginHorizontal: 0,
    alignSelf: "stretch",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: "#111827",
  },
  statusMessageText: {
    color: "#eaecee",
    textAlign: "center",
    fontWeight: "500",
  },
  // Confirm modal
  confirmOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  confirmPopup: {
    backgroundColor: "#121620",
    padding: 24,
    borderRadius: 12,
    width: "100%",
    maxWidth: 400,
  },
  confirmText: {
    color: "#eaecee",
    textAlign: "center",
    fontSize: 16,
  },
  confirmButtons: {
    marginTop: 18,
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  btnConfirm: {
    backgroundColor: "#28a745",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  btnConfirmText: {
    color: "#ffffff",
    fontWeight: "600",
  },
  btnCancel: {
    backgroundColor: "#dc3545",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  btnCancelText: {
    color: "#ffffff",
    fontWeight: "600",
  },
  // Booking details modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    backgroundColor: "#0b0d12",
    borderRadius: 14,
    padding: 24,
    width: "100%",
    maxWidth: 780,
    maxHeight: "90%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#f3f4f6",
  },
  closeButton: {
    backgroundColor: "#1f2937",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  closeButtonText: {
    color: "#ffffff",
  },
  sectionCard: {
    backgroundColor: "#111827",
    borderRadius: 10,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 10,
    color: "#e6eef3",
  },
  sectionText: {
    color: "#eaecee",
    fontSize: 14,
    marginBottom: 4,
  },
  sectionStrong: {
    fontWeight: "600",
    color: "#eaecee",
  },
  sectionListItem: {
    color: "#eaecee",
    fontSize: 14,
    marginBottom: 4,
    paddingLeft: 6,
  },
  sectionStrongText: {
    fontWeight: "600",
    color: "#eaecee",
    marginTop: 8,
  },
  grid2: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
});

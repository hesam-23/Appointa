import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  Scissors, Search, Calendar as CalendarIcon, Clock, DollarSign, User, Phone, Mail,
  CheckCircle2, XCircle, AlertTriangle, Plus, Trash2, Shield, ChevronLeft, ChevronRight, ChevronDown,
  CreditCard, Users, MapPin, Ban, RotateCcw, TrendingUp, Settings as SettingsIcon,
  ClipboardList, Bell, X, Image as ImageIcon, Lock, LogOut, FileText, Download, Printer
} from "lucide-react";

/* ----------------------------------------------------------------------
   JULOCT — interactive prototype
   Barbershop booking platform. Payments & SMS are simulated for this demo.
---------------------------------------------------------------------- */

function fmtDate(d) {
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
function fmtTime(h) {
  const totalMin = Math.round(h * 60);
  const hh24 = Math.floor(totalMin / 60);
  const mm = totalMin % 60;
  const period = hh24 >= 12 ? "PM" : "AM";
  const hour = hh24 % 12 === 0 ? 12 : hh24 % 12;
  return `${hour}:${String(mm).padStart(2, "0")} ${period}`;
}
function timeSortKey(iso, hour) {
  return `${iso}-${String(Math.round(hour * 60)).padStart(5, "0")}`;
}
function isoOf(d) {
  return d.toISOString().slice(0, 10);
}
function currentAddressOf(barber) {
  if (barber.pendingMove && isoOf(new Date()) >= barber.pendingMove.effectiveDate) {
    return barber.pendingMove.newAddress;
  }
  return barber.address;
}

function derivedBookingStatus(b, todayIso) {
  if (b.status === "no-show") return "No Show";
  if (b.status === "cancelled" || b.status === "cancelled-by-barber") return "Cancelled";
  if (b.status === "pending") return "Pending Review";
  if (b.status === "confirmed") return b.iso < todayIso ? "Completed" : "Upcoming";
  return b.status;
}
function derivedPaymentStatus(b, todayIso) {
  if (b.paymentStatus === "refunded") return "Refunded";
  if (b.paymentStatus === "paid-to-barber") return "Paid";
  if (b.paymentStatus === "not_charged") return "Pay in person";
  if (b.status === "confirmed" && b.iso < todayIso) return "Paid";
  return "On Hold";
}
const CUSTOMER_CHANGE_LIMIT = 5; // per rolling year
const BARBER_CHANGE_LIMIT = 5; // per rolling month
function customerChangeCancelCount(phone, auditLog) {
  if (!phone) return 0;
  const since = new Date(); since.setDate(since.getDate() - 365);
  return auditLog.filter((l) =>
    l.phone === phone &&
    (l.type === "booking_cancelled_by_customer" || l.type === "booking_reschedule_declined") &&
    new Date(l.at) >= since
  ).length;
}
function barberChangeCancelCount(barberId, auditLog) {
  if (!barberId) return 0;
  const since = new Date(); since.setDate(since.getDate() - 30);
  return auditLog.filter((l) =>
    l.barberId === barberId &&
    (l.type === "booking_cancelled_by_barber" || l.type === "booking_reschedule_requested") &&
    new Date(l.at) >= since
  ).length;
}
function matchesDateFilter(dateIso, mode, f) {
  if (!dateIso) return mode === "all";
  if (mode === "day") return f.day && dateIso === f.day;
  if (mode === "month") return f.month && dateIso.slice(0, 7) === f.month;
  if (mode === "year") return f.year && dateIso.slice(0, 4) === f.year;
  if (mode === "range") {
    if (!f.from && !f.to) return true;
    if (f.from && dateIso < f.from) return false;
    if (f.to && dateIso > f.to) return false;
    return true;
  }
  return true; // all
}
function monthKey(iso) { return iso ? iso.slice(0, 7) : "unknown"; }

function downloadCSV(filename, rows) {
  const csv = rows.map((r) => r.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const HOLIDAYS = [
  { id: "newyear", label: "New Year's Day", date: "2026-01-01" },
  { id: "mlk", label: "MLK Day", date: "2026-01-19" },
  { id: "presidents", label: "Presidents' Day", date: "2026-02-16" },
  { id: "memorial", label: "Memorial Day", date: "2026-05-25" },
  { id: "juneteenth", label: "Juneteenth", date: "2026-06-19" },
  { id: "independence", label: "Independence Day", date: "2026-07-04" },
  { id: "labor", label: "Labor Day", date: "2026-09-07" },
  { id: "thanksgiving", label: "Thanksgiving", date: "2026-11-26" },
  { id: "christmas", label: "Christmas Day", date: "2026-12-25" },
];
const WEEKDAYS = [
  { id: 0, label: "Sun" }, { id: 1, label: "Mon" }, { id: 2, label: "Tue" }, { id: 3, label: "Wed" },
  { id: 4, label: "Thu" }, { id: 5, label: "Fri" }, { id: 6, label: "Sat" },
];
const BREAK_LABELS = ["Lunch", "Breakfast", "Dinner", "Personal", "Emergency", "Other"];
const PENALTY_DEPOSIT = 500;
const PENALTY_PER_CANCELLATION = 45;
const DEFAULT_CALENDAR_SETTINGS = {
  workingHours: { start: 9, end: 17 },
  slotDurationMinutes: 60,
  bufferMinutes: 0,
  breaks: [],
  weeklyDaysOff: [],
  holidaysEnabled: {},
};
function planDays(barber) {
  const p = (barber?.subscription?.plan || "").split(" · ")[0];
  if (p === "Annual") return 365;
  if (p === "6-Month") return 180;
  return 30; // Monthly (and safe fallback)
}

function buildCalendar(seed, days = 14, settings = DEFAULT_CALENDAR_SETTINGS) {
  const { workingHours, slotDurationMinutes, bufferMinutes, breaks, weeklyDaysOff, holidaysEnabled } = { ...DEFAULT_CALENDAR_SETTINGS, ...settings };
  const step = (slotDurationMinutes + bufferMinutes) / 60;
  const today = new Date();
  const out = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const iso = isoOf(d);
    const dow = d.getDay();
    const holiday = HOLIDAYS.find((h) => h.date === iso && holidaysEnabled[h.id]);
    const weeklyOff = weeklyDaysOff.includes(dow);
    const slots = [];
    if (!holiday && !weeklyOff) {
      for (let h = workingHours.start; h < workingHours.end - 1e-9; h += step) {
        const inBreak = breaks.some((b) => h >= b.start && h < b.end);
        if (inBreak) continue;
        const hour = Math.round(h * 100) / 100;
        let status = "open";
        if (i < 21) {
          const key = Math.round(hour * 10 + seed + i * 3) % 5;
          if (key === 0) status = "booked";
        }
        slots.push({ hour, status, bookingId: null });
      }
    }
    out.push({ date: d, iso, blocked: !!holiday || weeklyOff, slots });
  }
  return out;
}

/** Rebuilds a barber's calendar after they change working hours/duration/buffer/breaks/holidays/days-off,
 *  keeping already-booked slots intact (best-effort — a demo-scale reconciliation, not a production merge). */
function regenerateCalendarKeepingBookings(oldDays, seed, days, settings) {
  const fresh = buildCalendar(seed, days, settings);
  oldDays.forEach((oldDay) => {
    const newDay = fresh.find((d) => d.iso === oldDay.iso);
    if (!newDay) return;
    const bookedSlots = oldDay.slots.filter((s) => s.status === "booked" || s.status === "blocked");
    bookedSlots.forEach((s) => {
      newDay.slots = newDay.slots.filter((fs) => fs.hour !== s.hour);
      newDay.slots.push({ ...s });
    });
    newDay.slots.sort((a, b) => a.hour - b.hour);
    if (oldDay.blocked && bookedSlots.some((s) => s.status === "booked")) newDay.blocked = false; // don't hide a day that still has real bookings
  });
  return fresh;
}

const INITIAL_BARBERS = [
  {
    id: "b1", name: "Marcus Cole", shop: "The Fade Room", zip: "48009", city: "Birmingham", state: "MI",
    address: "142 Old Woodward Ave, Birmingham, MI 48009", gender: "Male", referralSource: "Instagram",
    phone: "(313) 555-0148", bio: "12 years behind the chair. Known for precision skin fades and sharp lineups.",
    accountStatus: "active", photoHue: 28, pendingMove: null, createdAt: "2026-03-02T00:00:00.000Z",
    calendarSeed: 1,
    calendarSettings: { workingHours: { start: 9, end: 17 }, slotDurationMinutes: 60, bufferMinutes: 0, breaks: [{ id: "br1", label: "Lunch", start: 12, end: 13 }], weeklyDaysOff: [0], holidaysEnabled: { christmas: true, thanksgiving: true, independence: true } },
    penaltyEnabled: false, securityDeposit: 0, penaltyHistory: [],
    subscription: { plan: "Monthly · $100/mo", status: "active", renewsOn: "Aug 3, 2026" },
  },
  {
    id: "b2", name: "Dana Reyes", shop: "Reyes Barbershop", zip: "48009", city: "Birmingham", state: "MI",
    address: "88 W Maple Rd, Birmingham, MI 48009", gender: "Female", referralSource: "Referred by a friend",
    phone: "(248) 555-0199", bio: "Classic cuts and straight-razor shaves. Walk-ins welcome between bookings.",
    accountStatus: "active", photoHue: 200, pendingMove: null, createdAt: "2026-01-18T00:00:00.000Z",
    calendarSeed: 2,
    calendarSettings: { workingHours: { start: 8, end: 18 }, slotDurationMinutes: 30, bufferMinutes: 10, breaks: [{ id: "br2", label: "Lunch", start: 13, end: 14 }], weeklyDaysOff: [0, 1], holidaysEnabled: { christmas: true, thanksgiving: true } },
    penaltyEnabled: true, securityDeposit: 500, penaltyHistory: [],
    subscription: { plan: "Annual · $900/yr", status: "grace", renewsOn: "Jun 28, 2026" },
  },
  {
    id: "b3", name: "Tommy Nguyen", shop: "Nguyen & Sons", zip: "48334", city: "Sterling Heights", state: "MI",
    address: "4210 15 Mile Rd, Sterling Heights, MI 48310", gender: "Male", referralSource: "Google Search",
    phone: "(586) 555-0122", bio: "Modern styles and kids' cuts in a family-friendly shop.",
    accountStatus: "active", photoHue: 350, pendingMove: null, createdAt: "2026-05-27T00:00:00.000Z",
    calendarSeed: 3,
    calendarSettings: { workingHours: { start: 10, end: 19 }, slotDurationMinutes: 45, bufferMinutes: 15, breaks: [], weeklyDaysOff: [1], holidaysEnabled: { christmas: true } },
    penaltyEnabled: false, securityDeposit: 0, penaltyHistory: [],
    subscription: { plan: "6-Month · $400", status: "active", renewsOn: "Sep 12, 2026" },
  },
  {
    id: "b4", name: "Jordan Blake", shop: "Blake Cuts", zip: "48104", city: "Ann Arbor", state: "MI",
    address: "310 S State St, Ann Arbor, MI 48104", gender: "Male", referralSource: "TikTok",
    phone: "(734) 555-0177", bio: "College-town regular. Fast, clean fades between classes.",
    accountStatus: "active", photoHue: 145, pendingMove: null, createdAt: "2026-04-11T00:00:00.000Z",
    calendarSeed: 4,
    calendarSettings: { workingHours: { start: 9, end: 18 }, slotDurationMinutes: 30, bufferMinutes: 5, breaks: [{ id: "br4", label: "Lunch", start: 13, end: 13.5 }], weeklyDaysOff: [0], holidaysEnabled: { christmas: true, thanksgiving: true } },
    penaltyEnabled: false, securityDeposit: 0, penaltyHistory: [],
    subscription: { plan: "Monthly · $100/mo", status: "active", renewsOn: "Aug 15, 2026" },
  },
  {
    id: "b5", name: "Maria Chen", shop: "Chen's Chair", zip: "49503", city: "Grand Rapids", state: "MI",
    address: "77 Monroe Center St, Grand Rapids, MI 49503", gender: "Female", referralSource: "Facebook",
    phone: "(616) 555-0143", bio: "Precision fades and color work. Ten years in, still obsessed with a clean edge-up.",
    accountStatus: "active", photoHue: 260, pendingMove: null, createdAt: "2026-02-09T00:00:00.000Z",
    calendarSeed: 5,
    calendarSettings: { workingHours: { start: 9, end: 17 }, slotDurationMinutes: 45, bufferMinutes: 10, breaks: [{ id: "br5", label: "Lunch", start: 12.5, end: 13.5 }], weeklyDaysOff: [0, 6], holidaysEnabled: { christmas: true } },
    penaltyEnabled: true, securityDeposit: 455, penaltyHistory: [{ reason: "Cancelled within 24h · J. Whitfield", amount: 45, at: "2026-06-30T00:00:00.000Z" }],
    subscription: { plan: "Annual · $900/yr", status: "active", renewsOn: "Feb 9, 2027" },
  },
  {
    id: "b6", name: "Andre Wallace", shop: "Wallace Barber Co.", zip: "48201", city: "Detroit", state: "MI",
    address: "1420 Woodward Ave, Detroit, MI 48201", gender: "Male", referralSource: "Advertising",
    phone: "(313) 555-0166", bio: "Old-school barbershop feel, hot towel finish on every cut.",
    accountStatus: "active", photoHue: 15, pendingMove: null, createdAt: "2026-06-20T00:00:00.000Z",
    calendarSeed: 6,
    calendarSettings: { workingHours: { start: 10, end: 20 }, slotDurationMinutes: 60, bufferMinutes: 0, breaks: [{ id: "br6", label: "Dinner", start: 17, end: 17.5 }], weeklyDaysOff: [0], holidaysEnabled: {} },
    penaltyEnabled: false, securityDeposit: 0, penaltyHistory: [],
    subscription: { plan: "6-Month · $400", status: "active", renewsOn: "Dec 20, 2026" },
  },
];

const INITIAL_SERVICES = {
  b1: [
    { id: "s1", name: "Skin Fade", price: 35, duration: 30 },
    { id: "s2", name: "Fade + Beard Line-up", price: 50, duration: 45 },
    { id: "s3", name: "Hot Towel Shave", price: 30, duration: 30 },
  ],
  b2: [
    { id: "s4", name: "Classic Cut", price: 28, duration: 30 },
    { id: "s5", name: "Straight-Razor Shave", price: 32, duration: 30 },
  ],
  b3: [
    { id: "s6", name: "Kids Cut (12 & under)", price: 22, duration: 20 },
    { id: "s7", name: "Fade + Design", price: 45, duration: 40 },
  ],
  b4: [
    { id: "s8", name: "Student Fade", price: 25, duration: 30 },
    { id: "s9", name: "Beard Trim", price: 15, duration: 15 },
  ],
  b5: [
    { id: "s10", name: "Precision Fade", price: 40, duration: 45 },
    { id: "s11", name: "Color Touch-up", price: 55, duration: 45 },
    { id: "s12", name: "Edge-up", price: 18, duration: 15 },
  ],
  b6: [
    { id: "s13", name: "Classic Barbershop Cut", price: 32, duration: 60 },
    { id: "s14", name: "Hot Towel Shave", price: 28, duration: 30 },
  ],
};

const INITIAL_PHOTOS = {
  b1: [
    { id: "p1", label: "Marcus" }, { id: "p2", label: "My chair" }, { id: "p3", label: "Shop interior" },
  ],
  b2: [
    { id: "p4", label: "Dana" }, { id: "p5", label: "Chair setup" },
  ],
  b3: [
    { id: "p6", label: "Tommy" }, { id: "p7", label: "Shop front" }, { id: "p8", label: "Kids corner" },
  ],
  b4: [
    { id: "p9", label: "Jordan" }, { id: "p10", label: "Shop front" },
  ],
  b5: [
    { id: "p11", label: "Maria" }, { id: "p12", label: "My chair" }, { id: "p13", label: "Shop interior" },
  ],
  b6: [
    { id: "p14", label: "Andre" }, { id: "p15", label: "Barbershop floor" },
  ],
};

const MAX_PHOTOS = 6;
const PAGE_SIZE = 3; // shows 3 of the 6 demo barbers up front — "Show more" reveals the rest
const US_STATES = ["Michigan", "Ohio", "Indiana", "Illinois", "California", "New York", "Texas", "Florida"];
const REFERRAL_SOURCES = ["Instagram", "Google Search", "Facebook", "TikTok", "Referred by a friend", "Advertising", "Other"];

const FAKE_NAMES = ["J. Whitfield", "R. Osei", "T. Park", "M. Delgado", "K. Brandt"];

function seedBookings(barbers, calendarByBarber) {
  const bookings = [];
  barbers.forEach((b, bi) => {
    calendarByBarber[b.id].slice(0, 21).forEach((day, dayIdx) => {
      day.slots.forEach((slot, slotIdx) => {
        if (slot.status === "booked") {
          const id = `seed-${b.id}-${day.iso}-${slotIdx}`;
          slot.bookingId = id;
          const svc = INITIAL_SERVICES[b.id][(slotIdx + dayIdx) % INITIAL_SERVICES[b.id].length];
          bookings.push({
            id,
            barberId: b.id,
            customerName: FAKE_NAMES[(slotIdx + bi) % FAKE_NAMES.length],
            phone: "(313) 555-01" + (10 + (slotIdx % 9)),
            email: "guest@example.com",
            service: svc.name,
            price: svc.price,
            iso: day.iso,
            hour: slot.hour,
            notes: "",
            status: "confirmed",
            paymentStatus: b.penaltyEnabled ? "paid-to-barber" : "not_charged",
            address: b.address,
            recentMove: false,
            createdAt: day.iso + "T09:00:00.000Z",
            referralSource: ["Instagram", "Google Search", "Referred by a friend", null][(slotIdx + bi) % 4],
          });
        }
      });
    });
  });
  return bookings;
}

const PLANS = [
  { id: "monthly", label: "Monthly", price: 100, cadence: "/mo", months: 1 },
  { id: "sixmonth", label: "6-Month", price: 400, cadence: "one-time", months: 6 },
  { id: "annual", label: "Annual", price: 900, cadence: "/yr", months: 12 },
];

const BARBER_TERMS = [
  "Membership in JULOCT: the cost of your selected membership plan will be charged to you, and it will renew according to the settings you choose.",
  "Ending or cancelling membership: if your membership ends or is cancelled, your existing bookings and current customers are preserved — but until you reactivate, your profile won't be shown to new customers and you won't receive new bookings.",
  "Customer payment and the Hold system: customers pay the full service amount at booking. This amount is held to protect both parties, and is paid out to you after the service is completed, per JULOCT's payment policies.",
  "Changing and cancelling appointments: you may cancel or reschedule up to 5 bookings per month (customers up to 5 per year) without penalty, as long as it's 24+ hours before the appointment. Inside 24 hours, cancellation terms follow your dashboard settings and JULOCT's rules.",
  "Full control over services and pricing: you set your own services, prices, working hours, and bookable times. JULOCT takes no percentage or commission from your bookings.",
  "Managing your calendar: you have full control over your work calendar and can enable, disable, or block days, hours, holidays, and unavailable times at any time.",
  "Rescheduling confirmed bookings: a request to change a confirmed booking's time must go through the system, and the customer may accept it or release the booking and choose a new time themselves.",
  "Service and profile information: you're responsible for keeping your services, prices, photos, working hours, and location information accurate and up to date.",
  "Licensing and legal responsibility: you confirm you hold the licenses, permits, and legal requirements to practice professionally under U.S. federal, state, and local law, and can provide documentation to authorities if required.",
  "Photos and public profile: up to six photos of yourself, your chair, and your workspace may appear on your public page — no unrelated, unrealistic, or misleading images.",
  "Changing your work location: if you move, you must record the new address and start date through your dashboard so customers always see accurate location information.",
  "Taxes and income reporting: you are solely responsible for taxes and legal obligations on your income. JULOCT does not issue official tax forms — only a report of bookings and recorded income, viewable, downloadable, and printable from your dashboard.",
];

function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function formatPhoneDigits(raw) {
  const digits = raw.replace(/\D/g, "").slice(0, 10);
  const p1 = digits.slice(0, 3);
  const p2 = digits.slice(3, 6);
  const p3 = digits.slice(6, 10);
  if (digits.length > 6) return `(${p1}) ${p2}-${p3}`;
  if (digits.length > 3) return `(${p1}) ${p2}`;
  if (digits.length > 0) return `(${p1}`;
  return "";
}
function isValidUSPhone(formatted) {
  const digits = formatted.replace(/\D/g, "");
  if (digits.length !== 10) return false;
  const area = digits.slice(0, 3);
  const exchange = digits.slice(3, 6);
  if (area[0] === "0" || area[0] === "1") return false;
  if (exchange[0] === "0" || exchange[0] === "1") return false;
  if (/^(\d)\1{9}$/.test(digits)) return false; // e.g. 5555555555
  return true;
}

/* ---------------------------- shared bits ---------------------------- */

function Pill({ tone = "slate", children }) {
  return <span className={`ap-pill ap-pill-${tone}`}>{children}</span>;
}

function Ticket({ children, className = "" }) {
  return (
    <div className={`ap-ticket ${className}`}>
      <span className="ap-notch ap-notch-l" />
      <span className="ap-notch ap-notch-r" />
      {children}
    </div>
  );
}

function BarberPhoto({ barber, size = "md", variant = "card" }) {
  const hue = barber.photoHue ?? 30;
  return (
    <div
      className={`ap-photo ap-photo-${size} ap-photo-${variant}`}
      style={{ background: `linear-gradient(160deg, hsl(${hue} 35% 22%), hsl(${hue} 25% 12%))` }}
    >
      <Scissors size={size === "lg" ? 30 : 22} />
    </div>
  );
}

function PhotoCarousel({ barber, photos, variant = "card" }) {
  const [idx, setIdx] = useState(0);
  const list = photos && photos.length ? photos : [{ id: "default", label: barber.shop }];

  useEffect(() => {
    setIdx(0);
    if (list.length <= 1) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % list.length), 3200);
    return () => clearInterval(t);
  }, [list.length, barber.id]);

  const hue = barber.photoHue ?? 30;
  const current = list[idx];
  const tint = (hue + idx * 22) % 360;

  return (
    <div className={`ap-photo ap-photo-${variant} ap-carousel`} style={{ background: `linear-gradient(160deg, hsl(${tint} 35% 22%), hsl(${tint} 25% 12%))` }}>
      <Scissors size={variant === "header" ? 26 : 28} />
      <span className="ap-carousel-label">{current.label}</span>
      {list.length > 1 && (
        <>
          <button className="ap-carousel-nav ap-carousel-prev" onClick={(e) => { e.stopPropagation(); setIdx((i) => (i - 1 + list.length) % list.length); }}>
            <ChevronLeft size={14} />
          </button>
          <button className="ap-carousel-nav ap-carousel-next" onClick={(e) => { e.stopPropagation(); setIdx((i) => (i + 1) % list.length); }}>
            <ChevronRight size={14} />
          </button>
          <div className="ap-carousel-dots">
            {list.map((_, i) => <span key={i} className={i === idx ? "active" : ""} />)}
          </div>
        </>
      )}
    </div>
  );
}

function Toast({ message, onClose }) {
  if (!message) return null;
  return (
    <div className="ap-toast">
      <Bell size={14} />
      <span>{message}</span>
      <button onClick={onClose}><X size={13} /></button>
    </div>
  );
}

/* ============================ CUSTOMER APP ============================ */

function CustomerApp({ barbers, setBarbers, servicesByBarber, photosByBarber, calendarByBarber, setCalendarByBarber, bookings, setBookings, invites, setInvites, cancellationFlags, setCancellationFlags, rescheduleRequests, setRescheduleRequests, auditLog, notify, logAudit }) {
  const [screen, setScreen] = useState("search"); // search | profile | book | confirm | alternatives
  const [query, setQuery] = useState("");
  const [zip, setZip] = useState("");
  const [selectedBarberId, setSelectedBarberId] = useState(null);
  const [selectedService, setSelectedService] = useState(null);
  const [dayIdx, setDayIdx] = useState(0);
  const [selectedHour, setSelectedHour] = useState(null);
  const [form, setForm] = useState({ first: "", last: "", phone: "", email: "", notes: "", referralSource: "" });
  const [addExtra, setAddExtra] = useState(false);
  const [extraDayIdx, setExtraDayIdx] = useState(null);
  const [extraHour, setExtraHour] = useState(null);
  const [extraService, setExtraService] = useState(null);
  const [extraNote, setExtraNote] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [payStep, setPayStep] = useState("idle"); // idle | processing | failed | paid
  const [lastBooking, setLastBooking] = useState(null);
  const [lastBookings, setLastBookings] = useState([]);
  const [dismissedCancelNotices, setDismissedCancelNotices] = useState([]);
  const [dismissedRescheduleNotices, setDismissedRescheduleNotices] = useState([]);
  const [acknowledgedFlaggedBarbers, setAcknowledgedFlaggedBarbers] = useState([]);
  const [alternativesOrigin, setAlternativesOrigin] = useState(null);
  const [originalSlot, setOriginalSlot] = useState(null);
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({ name: "", phone: "", state: "", gender: "" });
  const [inviteSent, setInviteSent] = useState(false);

  const barber = barbers.find((b) => b.id === selectedBarberId);
  const services = selectedBarberId ? servicesByBarber[selectedBarberId] : [];
  const calendar = selectedBarberId ? calendarByBarber[selectedBarberId] : [];
  const day = calendar[dayIdx];

  const results = useMemo(() => {
    let list = barbers.filter((b) => b.accountStatus === "active" && b.subscription.status !== "inactive");
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter((b) => b.name.toLowerCase().includes(q) || b.phone.includes(q) || b.shop.toLowerCase().includes(q));
    }
    return list;
  }, [barbers, query]);

  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [query]);
  const visibleResults = results.slice(0, visibleCount);

  const nearby = useMemo(() => {
    if (!zip) return [];
    return barbers.filter((b) => b.accountStatus === "active" && b.zip === zip);
  }, [barbers, zip]);

  function openBarber(id) {
    setSelectedBarberId(id);
    setSelectedService(null);
    setDayIdx(1); // default to first fully-bookable day
    setSelectedHour(null);
    setScreen("profile");
  }

  function startBooking(service) {
    setSelectedService(service);
    setDayIdx(1);
    setSelectedHour(null);
    setAddExtra(false);
    setExtraDayIdx(null);
    setExtraHour(null);
    setExtraService(null);
    setExtraNote("");
    setAgreedToTerms(false);
    setPayStep("idle");
    setScreen("book");
  }

  const paymentAmount = (selectedService ? selectedService.price : 0) + (addExtra && extraHour != null && extraService ? extraService.price : 0);

  function confirmBooking() {
    if (!barber.penaltyEnabled) {
      finalizeBooking();
      return;
    }
    setPayStep("processing");
    setTimeout(() => {
      setPayStep("paid");
      finalizeBooking();
    }, 900);
  }

  function finalizeBooking() {
    const id = "bk-" + Date.now();
    const bookingAddress = currentAddressOf(barber);
    const recentMove = !!(barber.pendingMove && bookingAddress === barber.pendingMove.newAddress);
    const customerFlagCount = customerChangeCancelCount(form.phone, auditLog);
    const needsReview = customerFlagCount >= CUSTOMER_CHANGE_LIMIT;
    const initialStatus = needsReview ? "pending" : "confirmed";
    const newBooking = {
      id, barberId: barber.id, customerName: `${form.first} ${form.last}`.trim(),
      phone: form.phone, email: form.email, service: selectedService.name, price: selectedService.price,
      iso: day.iso, hour: selectedHour, notes: form.notes, status: initialStatus,
      paymentStatus: barber.penaltyEnabled ? "paid-to-barber" : "not_charged", address: bookingAddress, recentMove,
      referralSource: form.referralSource || null, createdAt: new Date().toISOString(),
      flagReason: needsReview ? `${customerFlagCount} changes/cancellations in the past year` : null,
    };
    const newBookings = [newBooking];
    const extraDay = extraDayIdx != null ? calendar[extraDayIdx] : null;

    setCalendarByBarber((prev) => {
      const copy = structuredClone(prev);
      const d = copy[barber.id].find((x) => x.iso === day.iso);
      const slot = d.slots.find((s) => s.hour === selectedHour);
      slot.status = "booked";
      slot.bookingId = id;

      if (addExtra && extraDay && extraHour != null && extraService) {
        const extraId = "bk-" + (Date.now() + 1);
        const d2 = copy[barber.id].find((x) => x.iso === extraDay.iso);
        const s2 = d2.slots.find((s) => s.hour === extraHour);
        s2.status = "booked";
        s2.bookingId = extraId;
        newBookings.push({
          id: extraId, barberId: barber.id, customerName: `${form.first} ${form.last}`.trim() + " (guest)",
          phone: form.phone, email: form.email, service: extraService.name, price: extraService.price,
          iso: extraDay.iso, hour: extraHour, notes: extraNote, status: initialStatus,
          paymentStatus: barber.penaltyEnabled ? "paid-to-barber" : "not_charged", address: bookingAddress, recentMove, createdAt: new Date().toISOString(),
          flagReason: newBooking.flagReason,
        });
      }
      return copy;
    });

    setBookings((prev) => [...prev, ...newBookings]);
    setLastBooking(newBooking);
    setLastBookings(newBookings);
    logAudit({ type: "booking_created", actor: newBooking.customerName || "Guest", phone: newBooking.phone, after: { barber: barber.name, service: newBooking.service, iso: newBooking.iso, hour: newBooking.hour, price: paymentAmount, needsReview }, meta: newBooking.phone });
    notify(`Booking confirmed with ${barber.name} for ${fmtDate(day.date)} at ${fmtTime(selectedHour)}`);
    setScreen("confirm");
  }

  function cancelJustBooked() {
    const ids = lastBookings.map((b) => b.id);
    const isLockedIn = lastBookings.some((lb) => lb.iso === calendar[0]?.iso);
    const forfeits = isLockedIn && barber.penaltyEnabled;
    setBookings((prev) => prev.map((b) => (ids.includes(b.id) ? { ...b, status: "cancelled", paymentStatus: forfeits ? "paid-to-barber" : (b.paymentStatus === "not_charged" ? "not_charged" : "refunded") } : b)));
    setCalendarByBarber((prev) => {
      const copy = structuredClone(prev);
      lastBookings.forEach((lb) => {
        const d = copy[barber.id].find((x) => x.iso === lb.iso);
        const slot = d.slots.find((s) => s.hour === lb.hour);
        if (slot) {
          // published immediately and openly for anyone to book — the barber
          // shouldn't lose out on a cancelled slot while it waits for a match
          slot.status = "open";
          slot.bookingId = null;
        }
      });
      return copy;
    });
    const total = lastBookings.reduce((s, lb) => s + lb.price, 0);
    logAudit({
      type: "booking_cancelled_by_customer", actor: `${form.first} ${form.last}`.trim() || "Guest", phone: form.phone,
      before: { status: "confirmed" },
      after: { status: "cancelled", forfeited: forfeits, reason: cancelReason.trim() },
      meta: lastBookings.map((lb) => `${lb.iso} ${fmtTime(lb.hour)}`).join(", "),
    });
    setCancellationFlags((prev) => [...prev, {
      id: "cf-" + Date.now(),
      name: `${form.first} ${form.last}`.trim(),
      phone: form.phone,
      reason: cancelReason.trim(),
      barberId: barber.id,
      createdAt: new Date().toISOString(),
    }]);
    if (forfeits) {
      notify(`Booking${lastBookings.length > 1 ? "s" : ""} cancelled — since it was inside 24 hours, the $${total} stays with ${barber.name}.`);
    } else if (barber.penaltyEnabled) {
      notify(`Booking${lastBookings.length > 1 ? "s" : ""} cancelled — your $${total} has been refunded in full.`);
    } else {
      notify(`Booking${lastBookings.length > 1 ? "s" : ""} cancelled — no payment was collected, so there's nothing to refund.`);
    }
    setShowCancelForm(false);
    setCancelReason("");
    setScreen("search");
  }

  function acceptReschedule(reqId) {
    const req = rescheduleRequests.find((r) => r.id === reqId);
    if (!req) return;
    const bk = bookings.find((b) => b.id === req.bookingId);
    setCalendarByBarber((prev) => {
      const copy = structuredClone(prev);
      const oldDay = copy[req.barberId].find((x) => x.iso === req.oldIso);
      const oldSlot = oldDay?.slots.find((s) => s.hour === req.oldHour);
      if (oldSlot) { oldSlot.status = "open"; oldSlot.bookingId = null; }
      const newDay = copy[req.barberId].find((x) => x.iso === req.newIso);
      const newSlot = newDay?.slots.find((s) => s.hour === req.newHour);
      if (newSlot) { newSlot.status = "booked"; newSlot.bookingId = req.bookingId; }
      return copy;
    });
    setBookings((prev) => prev.map((b) => (b.id === req.bookingId ? { ...b, iso: req.newIso, hour: req.newHour, pendingRescheduleId: null } : b)));
    setRescheduleRequests((prev) => prev.map((r) => (r.id === reqId ? { ...r, status: "accepted" } : r)));
    logAudit({ type: "booking_reschedule_accepted", actor: bk?.customerName || "Guest", before: { iso: req.oldIso, hour: req.oldHour }, after: { iso: req.newIso, hour: req.newHour } });
    setDismissedRescheduleNotices((prev) => [...prev, reqId]);
    notify(`New time confirmed — ${req.newIso} at ${fmtTime(req.newHour)}.`);
  }

  function declineReschedule(reqId) {
    const req = rescheduleRequests.find((r) => r.id === reqId);
    if (!req) return;
    const bk = bookings.find((b) => b.id === req.bookingId);
    const reqBarber = barbers.find((b) => b.id === req.barberId);
    setCalendarByBarber((prev) => {
      const copy = structuredClone(prev);
      const oldDay = copy[req.barberId].find((x) => x.iso === req.oldIso);
      const oldSlot = oldDay?.slots.find((s) => s.hour === req.oldHour);
      if (oldSlot) { oldSlot.status = "open"; oldSlot.bookingId = null; }
      return copy;
    });
    setBookings((prev) => prev.map((b) => (b.id === req.bookingId ? { ...b, status: "cancelled", paymentStatus: "refunded", pendingRescheduleId: null } : b)));
    setRescheduleRequests((prev) => prev.map((r) => (r.id === reqId ? { ...r, status: "declined" } : r)));
    logAudit({ type: "booking_reschedule_declined", actor: bk?.customerName || "Guest", phone: bk?.phone, before: { status: "confirmed" }, after: { status: "cancelled" } });
    if (reqBarber?.penaltyEnabled) {
      setBarbers((prev) => prev.map((b) => (b.id === req.barberId ? {
        ...b, securityDeposit: Math.max(0, b.securityDeposit - PENALTY_PER_CANCELLATION),
        penaltyHistory: [...b.penaltyHistory, { reason: `Reschedule declined · ${bk?.customerName || "Guest"}`, amount: PENALTY_PER_CANCELLATION, at: new Date().toISOString() }],
      } : b)));
      logAudit({ type: "cancellation_penalty_charged", actor: reqBarber.name, barberId: req.barberId, after: { amount: PENALTY_PER_CANCELLATION }, meta: "Reschedule declined by customer" });
    }
    setDismissedRescheduleNotices((prev) => [...prev, reqId]);
    notify("Original time released and refunded — pick a new time whenever you're ready.");
  }

  function sendInvite() {
    if (!isValidUSPhone(inviteForm.phone)) return;
    setInvites((prev) => [...prev, { id: "inv-" + Date.now(), name: inviteForm.name, phone: inviteForm.phone, state: inviteForm.state, gender: inviteForm.gender, createdAt: new Date().toISOString() }]);
    setInviteSent(true);
    notify(`Invite text sent to ${inviteForm.phone} (simulated)`);
    setTimeout(() => {
      setShowInvite(false);
      setInviteSent(false);
      setInviteForm({ name: "", phone: "", state: "", gender: "" });
    }, 1400);
  }

  /* ---- SEARCH ---- */
  if (screen === "search") {
    const cancelledByBarber = lastBookings.filter((lb) => {
      const current = bookings.find((b) => b.id === lb.id);
      return current && current.status === "cancelled-by-barber" && !dismissedCancelNotices.includes(lb.id);
    });
    return (
      <div className="ap-stack">
        {cancelledByBarber.length > 0 && (() => {
          const originBarber = barbers.find((b) => b.id === cancelledByBarber[0].barberId);
          return (
            <div className="ap-notice ap-notice-crimson">
              <AlertTriangle size={16} />
              <div>
                <p><strong>We're sorry — {originBarber?.name} isn't able to complete your booked service.</strong> Your payment has been fully refunded. To find a replacement time, use the link below.</p>
                <div className="ap-actions" style={{ marginTop: 8 }}>
                  <button
                    className="ap-btn ap-btn-outline"
                    onClick={() => {
                      setAlternativesOrigin(originBarber);
                      setOriginalSlot({ iso: cancelledByBarber[0].iso, hour: cancelledByBarber[0].hour });
                      setDismissedCancelNotices((prev) => [...prev, ...cancelledByBarber.map((b) => b.id)]);
                      setScreen("alternatives");
                    }}
                  >
                    View available barbers near you
                  </button>
                  <button
                    className="ap-btn ap-btn-ghost"
                    onClick={() => setDismissedCancelNotices((prev) => [...prev, ...cancelledByBarber.map((b) => b.id)])}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {(() => {
          const myPendingReschedules = rescheduleRequests.filter((r) =>
            r.status === "pending" &&
            !dismissedRescheduleNotices.includes(r.id) &&
            lastBookings.some((lb) => lb.id === r.bookingId)
          );
          if (myPendingReschedules.length === 0) return null;
          const req = myPendingReschedules[0];
          const originBarber = barbers.find((b) => b.id === req.barberId);
          return (
            <div className="ap-notice ap-notice-sage">
              <CalendarIcon size={16} />
              <div>
                <p><strong>{originBarber?.name} would like to move your appointment.</strong> Proposed new time: <span className="ap-mono">{req.newIso} at {fmtTime(req.newHour)}</span> (was {req.oldIso} at {fmtTime(req.oldHour)}).</p>
                <div className="ap-actions" style={{ marginTop: 8 }}>
                  <button className="ap-btn ap-btn-primary" onClick={() => acceptReschedule(req.id)}>Accept new time</button>
                  <button className="ap-btn ap-btn-outline" onClick={() => declineReschedule(req.id)}>Decline — I'll pick a new time myself</button>
                </div>
              </div>
            </div>
          );
        })()}

        <div className="ap-hero">
          <p className="ap-eyebrow">Book a barber, no account needed</p>
          <h1 className="ap-h1">Find your barber.<br />Grab a chair.</h1>
          <div className="ap-search-row">
            <Search size={18} />
          <input placeholder="Search by barber name, state, or service" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        </div>

        {results.length > 0 && (
          <p className="ap-muted-sm ap-results-count">
            Showing {visibleResults.length} of {results.length} barber{results.length === 1 ? "" : "s"}
          </p>
        )}
        <div className="ap-grid ap-grid-profiles">
          {visibleResults.map((b) => (
            <div key={b.id} className="ap-profile-card">
              <PhotoCarousel barber={b} photos={photosByBarber[b.id]} />
              <div className="ap-profile-card-body">
                <h3>{b.name}</h3>
                <p className="ap-muted">{b.shop}</p>
                <p className="ap-muted-sm ap-location"><MapPin size={12} /> {b.city}, {b.state}</p>
              </div>
              <button className="ap-btn ap-btn-primary ap-profile-card-btn" onClick={() => openBarber(b.id)}>View & book</button>
            </div>
          ))}
          {results.length === 0 && (
            <div className="ap-empty">
              <p>No barber matched "{query}".</p>

              <div className="ap-field">
                <label>Try nearby by ZIP code</label>
                <input value={zip} onChange={(e) => setZip(e.target.value)} placeholder="48009" />
              </div>
              {nearby.length > 0 && (
                <div className="ap-grid ap-grid-profiles" style={{ marginTop: 12 }}>
                  {nearby.map((b) => (
                    <div key={b.id} className="ap-profile-card">
                      <PhotoCarousel barber={b} photos={photosByBarber[b.id]} />
                      <div className="ap-profile-card-body">
                        <h3>{b.name}</h3>
                        <p className="ap-muted">{b.shop}</p>
                        <p className="ap-muted-sm ap-location"><MapPin size={12} /> {b.city}, {b.state}</p>
                      </div>
                      <button className="ap-btn ap-btn-primary ap-profile-card-btn" onClick={() => openBarber(b.id)}>View & book</button>
                    </div>
                  ))}
                </div>
              )}

              <div className="ap-invite-cta">
                <p className="ap-muted-sm">Can't find who you're looking for?</p>
                <button className="ap-btn ap-btn-outline" onClick={() => setShowInvite(true)}>
                  <Phone size={14} /> Invite your barber to JULOCT
                </button>
              </div>
            </div>
          )}
        </div>

        {visibleCount < results.length && (
          <button className="ap-btn ap-btn-outline ap-show-more" onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}>
            Show more barbers ({results.length - visibleCount} more)
          </button>
        )}

        {showInvite && (
          <div className="ap-modal-overlay" onClick={() => !inviteSent && setShowInvite(false)}>
            <div className="ap-modal" onClick={(e) => e.stopPropagation()}>
              {!inviteSent ? (
                <>
                  <div className="ap-modal-head">
                    <h3>Invite your barber</h3>
                    <button className="ap-icon-btn" onClick={() => setShowInvite(false)}><X size={16} /></button>
                  </div>
                  <p className="ap-muted-sm">We'll text them a link to set up their JULOCT page — then you can book with them here.</p>
                  <div className="ap-field">
                    <label>Barber's name</label>
                    <input value={inviteForm.name} onChange={(e) => setInviteForm({ ...inviteForm, name: e.target.value })} placeholder="e.g. Chris at Main St Barbers" />
                  </div>
                  <div className="ap-field">
                    <label>Barber's gender</label>
                    <div className="ap-segmented">
                      <button
                        type="button"
                        className={inviteForm.gender === "Male" ? "active" : ""}
                        onClick={() => setInviteForm({ ...inviteForm, gender: "Male" })}
                      >
                        Male
                      </button>
                      <button
                        type="button"
                        className={inviteForm.gender === "Female" ? "active" : ""}
                        onClick={() => setInviteForm({ ...inviteForm, gender: "Female" })}
                      >
                        Female
                      </button>
                    </div>
                  </div>
                  <div className="ap-field">
                    <label><Phone size={12} /> Barber's mobile phone</label>
                    <input
                      value={inviteForm.phone}
                      onChange={(e) => setInviteForm({ ...inviteForm, phone: formatPhoneDigits(e.target.value) })}
                      placeholder="(313) 555-0100"
                      inputMode="numeric"
                      maxLength={14}
                    />
                    {inviteForm.phone.length > 0 && !isValidUSPhone(inviteForm.phone) && (
                      <p className="ap-field-hint ap-field-hint-error">Enter a complete, valid 10-digit US mobile number.</p>
                    )}
                  </div>
                  <div className="ap-field">
                    <label><MapPin size={12} /> State</label>
                    <div className="ap-select-wrap">
                      <select className="ap-select-fancy" value={inviteForm.state} onChange={(e) => setInviteForm({ ...inviteForm, state: e.target.value })}>
                        <option value="">Select a state</option>
                        {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <ChevronDown size={15} className="ap-select-chevron" />
                    </div>
                  </div>
                  <div className="ap-actions" style={{ justifyContent: "flex-end" }}>
                    <button className="ap-btn ap-btn-outline" onClick={() => setShowInvite(false)}>Cancel</button>
                    <button
                      className="ap-btn ap-btn-primary"
                      disabled={!inviteForm.name || !inviteForm.gender || !isValidUSPhone(inviteForm.phone) || !inviteForm.state}
                      onClick={sendInvite}
                    >
                      Send invite
                    </button>
                  </div>
                </>
              ) : (
                <div className="ap-invite-success">
                  <CheckCircle2 size={26} />
                  <p>Invite sent to {inviteForm.phone}.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ---- ALTERNATIVE BARBERS (after a barber-cancelled booking) ---- */
  if (screen === "alternatives" && alternativesOrigin && originalSlot) {
    const withMatch = barbers
      .filter((b) => b.id !== alternativesOrigin.id && b.accountStatus === "active" && b.city === alternativesOrigin.city && b.state === alternativesOrigin.state)
      .map((b) => {
        const sameDay = calendarByBarber[b.id].find((d) => d.iso === originalSlot.iso && !d.blocked);
        const openSameDay = sameDay ? sameDay.slots.filter((s) => s.status === "open") : [];
        if (openSameDay.length === 0) return null;
        const closest = openSameDay.reduce((best, s) => (Math.abs(s.hour - originalSlot.hour) < Math.abs(best.hour - originalSlot.hour) ? s : best));
        return { barber: b, matchedHour: closest.hour, diff: Math.abs(closest.hour - originalSlot.hour) };
      })
      .filter(Boolean)
      .sort((a, b) => a.diff - b.diff);

    return (
      <div className="ap-stack">
        <button className="ap-back" onClick={() => setScreen("search")}><ChevronLeft size={16} /> Homepage</button>
        <h2 className="ap-h2">Barbers near {alternativesOrigin.city}, {alternativesOrigin.state} at a similar time</h2>
        <p className="ap-muted-sm">
          Since your original appointment on {originalSlot.iso} at {fmtTime(originalSlot.hour)} fell through, here's who else in the area has an opening close to that same time.
        </p>
        <div className="ap-grid ap-grid-profiles">
          {withMatch.map(({ barber: b, matchedHour }) => (
            <div key={b.id} className="ap-profile-card">
              <PhotoCarousel barber={b} photos={photosByBarber[b.id]} />
              <div className="ap-profile-card-body">
                <h3>{b.name}</h3>
                <p className="ap-muted">{b.shop}</p>
                <p className="ap-muted-sm ap-location"><MapPin size={12} /> {b.city}, {b.state}</p>
                <p className="ap-muted-sm ap-mono">Open {fmtTime(matchedHour)} same day</p>
              </div>
              <button className="ap-btn ap-btn-primary ap-profile-card-btn" onClick={() => openBarber(b.id)}>View & book</button>
            </div>
          ))}
          {withMatch.length === 0 && <p className="ap-muted-sm">No one nearby has an opening close to that time today — try the homepage search for other dates.</p>}
        </div>
        <button className="ap-btn ap-btn-outline" onClick={() => setScreen("search")}>Go to homepage to book a new appointment</button>
      </div>
    );
  }

  /* ---- BARBER PROFILE ---- */
  if (screen === "profile" && barber) {
    const barberFlagCount = barberChangeCancelCount(barber.id, auditLog);
    const barberFlagged = barberFlagCount >= BARBER_CHANGE_LIMIT && !acknowledgedFlaggedBarbers.includes(barber.id);
    if (barberFlagged) {
      return (
        <div className="ap-stack ap-narrow">
          <button className="ap-back" onClick={() => setScreen("search")}><ChevronLeft size={16} /> All barbers</button>
          <div className="ap-notice">
            <AlertTriangle size={16} />
            <div>
              <p><strong>This barber has a history of frequent cancellations or time changes</strong> ({barberFlagCount} this month). Do you want to continue, or choose another barber?</p>
              <div className="ap-actions" style={{ marginTop: 8 }}>
                <button className="ap-btn ap-btn-primary" onClick={() => setAcknowledgedFlaggedBarbers((prev) => [...prev, barber.id])}>Continue anyway</button>
                <button className="ap-btn ap-btn-outline" onClick={() => setScreen("search")}>Choose another barber</button>
              </div>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="ap-stack">
        <button className="ap-back" onClick={() => setScreen("search")}><ChevronLeft size={16} /> All barbers</button>
        <div className="ap-profile-head">
          <PhotoCarousel barber={barber} photos={photosByBarber[barber.id]} variant="header" />
          <div>
            <h2 className="ap-h2">{barber.name}</h2>
            <p className="ap-muted">{barber.shop} · {barber.city}, {barber.state}</p>
            <p className="ap-muted-sm ap-mono"><MapPin size={12} /> {currentAddressOf(barber)}</p>
            {barber.penaltyEnabled && <Pill tone="brass">Charges a late-cancellation fee</Pill>}
            <p style={{ maxWidth: 480 }}>{barber.bio}</p>
          </div>
        </div>
        <h4 className="ap-section-label">Services</h4>
        <div className="ap-grid">
          {services.map((s) => (
            <Ticket key={s.id} className="ap-service-card">
              <div>
                <h3>{s.name}</h3>
                <p className="ap-muted-sm">{s.duration} min</p>
              </div>
              <div className="ap-service-right">
                <span className="ap-mono ap-price">${s.price}</span>
                <button className="ap-btn ap-btn-primary" onClick={() => startBooking(s)}>Book</button>
              </div>
            </Ticket>
          ))}
        </div>
      </div>
    );
  }

  /* ---- BOOK FLOW ---- */
  if (screen === "book" && barber) {
    return (
      <div className="ap-stack">
        <button className="ap-back" onClick={() => setScreen("profile")}><ChevronLeft size={16} /> {barber.name}</button>
        <h2 className="ap-h2">{selectedService.name} <span className="ap-mono ap-price-sm">${selectedService.price}</span></h2>

        <h4 className="ap-section-label">Pick a date <span className="ap-muted-sm">(next 3 weeks)</span></h4>
        <div className="ap-day-strip">
          {calendar.slice(0, 21).map((d, i) => (
            <button key={d.iso} disabled={d.blocked} className={`ap-day-chip ${i === dayIdx ? "active" : ""} ${d.blocked ? "disabled" : ""}`} onClick={() => { setDayIdx(i); setSelectedHour(null); }}>
              <span className="ap-mono">{fmtDate(d.date)}</span>
              {d.blocked && <Pill tone="slate">closed</Pill>}
            </button>
          ))}
        </div>

        {day && (
          <>
            <h4 className="ap-section-label">Pick a time</h4>
            {day.slots.some((s) => s.status === "open") ? (
              <div className="ap-slot-grid">
                {day.slots.map((s) => (
                  <button key={s.hour} disabled={s.status !== "open"} className={`ap-slot ${selectedHour === s.hour ? "active" : ""} ${s.status !== "open" ? "taken" : ""}`} onClick={() => setSelectedHour(s.hour)}>
                    {fmtTime(s.hour)}
                  </button>
                ))}
              </div>
            ) : (
              <div className="ap-notice">
                <AlertTriangle size={16} />
                <p><strong>{barber.name} is fully booked on {fmtDate(day.date)}.</strong> Please pick another date.</p>
              </div>
            )}
          </>
        )}

        {selectedHour != null && (
          <>
            <h4 className="ap-section-label">Your details</h4>
            <div className="ap-form-grid">
              <div className="ap-field"><label>First name</label><input value={form.first} onChange={(e) => setForm({ ...form, first: e.target.value })} /></div>
              <div className="ap-field"><label>Last name</label><input value={form.last} onChange={(e) => setForm({ ...form, last: e.target.value })} /></div>
              <div className="ap-field"><label><Phone size={12} /> Mobile phone</label><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(313) 555-0100" /></div>
              <div className="ap-field"><label><Mail size={12} /> Email</label><input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" /></div>
              <div className="ap-field ap-field-wide"><label>Note for {barber.name} (optional)</label><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
              <div className="ap-field">
                <label>How did you hear about JULOCT? <span className="ap-muted-sm">(optional)</span></label>
                <div className="ap-select-wrap">
                  <select className="ap-select-fancy" value={form.referralSource} onChange={(e) => setForm({ ...form, referralSource: e.target.value })}>
                    <option value="">Prefer not to say</option>
                    {REFERRAL_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <ChevronDown size={15} className="ap-select-chevron" />
                </div>
              </div>
            </div>

            <label className="ap-checkbox">
              <input
                type="checkbox"
                checked={addExtra}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setAddExtra(checked);
                  setExtraDayIdx(checked ? dayIdx : null);
                  setExtraHour(null);
                  setExtraService(null);
                  setExtraNote("");
                }}
              />
              Add one more booking to this visit (e.g. for a child or friend)
            </label>

            {addExtra && (
              <div className="ap-extra-block">
                <h4 className="ap-section-label">Second booking — pick a date</h4>
                <div className="ap-day-strip">
                  {calendar.slice(0, 21).map((d, i) => (
                    <button
                      key={d.iso}
                      disabled={d.blocked}
                      className={`ap-day-chip ${i === extraDayIdx ? "active" : ""} ${d.blocked ? "disabled" : ""}`}
                      onClick={() => { setExtraDayIdx(i); setExtraHour(null); }}
                    >
                      <span className="ap-mono">{fmtDate(d.date)}</span>
                      {d.blocked && <Pill tone="slate">closed</Pill>}
                    </button>
                  ))}
                </div>

                {extraDayIdx != null && (
                  <>
                    <h4 className="ap-section-label">Second booking — pick a time</h4>
                    {calendar[extraDayIdx].slots.some((s) => s.status === "open" && (extraDayIdx !== dayIdx || s.hour !== selectedHour)) ? (
                      <div className="ap-slot-grid">
                        {calendar[extraDayIdx].slots
                          .filter((s) => !(extraDayIdx === dayIdx && s.hour === selectedHour))
                          .map((s) => (
                            <button
                              key={s.hour}
                              disabled={s.status !== "open"}
                              className={`ap-slot ${extraHour === s.hour ? "active" : ""} ${s.status !== "open" ? "taken" : ""}`}
                              onClick={() => setExtraHour(s.hour)}
                            >
                              {fmtTime(s.hour)}
                            </button>
                          ))}
                      </div>
                    ) : (
                      <div className="ap-notice">
                        <AlertTriangle size={16} />
                        <p>No open slots that day — pick another date for this second booking.</p>
                      </div>
                    )}
                  </>
                )}

                {extraHour != null && (
                  <>
                    <h4 className="ap-section-label">Second booking — pick a service</h4>
                    <div className="ap-grid">
                      {services.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          className={`ap-extra-service ${extraService?.id === s.id ? "active" : ""}`}
                          onClick={() => setExtraService(s)}
                        >
                          <span>{s.name}</span>
                          <span className="ap-mono">${s.price}</span>
                        </button>
                      ))}
                    </div>
                    <div className="ap-field ap-field-wide">
                      <label>Note for this second booking (optional)</label>
                      <textarea value={extraNote} onChange={(e) => setExtraNote(e.target.value)} rows={2} placeholder="Anything the barber should know for this one" />
                    </div>
                  </>
                )}
              </div>
            )}

            <Ticket className="ap-summary">
              <div>
                <p className="ap-muted-sm">Summary</p>
                <p>{selectedService.name} with {barber.name}</p>
                <p className="ap-mono">{fmtDate(day.date)} · {fmtTime(selectedHour)}</p>
                {addExtra && extraDayIdx != null && extraHour != null && extraService && (
                  <p className="ap-mono">+ {extraService.name} · {fmtDate(calendar[extraDayIdx].date)} · {fmtTime(extraHour)}</p>
                )}
              </div>
              <div className="ap-summary-right">
                {barber.penaltyEnabled ? (
                  <>
                    <p className="ap-mono ap-price">${paymentAmount} total</p>
                    <p className="ap-muted-sm">Charged now, paid straight to {barber.name}.</p>
                  </>
                ) : (
                  <>
                    <p className="ap-mono ap-price">${paymentAmount}</p>
                    <p className="ap-muted-sm">Pay {barber.name} in person — nothing is charged now.</p>
                  </>
                )}
              </div>
            </Ticket>

            <div className="ap-policy-box">
              <p className="ap-policy-box-title">Booking terms</p>
              {barber.penaltyEnabled ? (
                <ol>
                  <li>You can change or cancel this booking free of charge up to 24 hours before the appointment time.</li>
                  <li>Inside 24 hours, a cancellation or change request needs {barber.name}'s approval — if they don't approve it, the amount paid is non-refundable.</li>
                </ol>
              ) : (
                <ol>
                  <li>No payment is collected now — you pay {barber.name} directly at the appointment.</li>
                  <li>You can change or cancel this booking up to 24 hours before the appointment time.</li>
                </ol>
              )}
              <label className="ap-checkbox">
                <input type="checkbox" checked={agreedToTerms} onChange={(e) => setAgreedToTerms(e.target.checked)} />
                I've read and agree to these terms
              </label>
            </div>

            <div className="ap-actions">
              {payStep === "failed" && (
                <p className="ap-error"><XCircle size={14} /> Payment didn't go through — no time is held until it succeeds. Try again.</p>
              )}
              <button
                className="ap-btn ap-btn-primary ap-btn-lg"
                disabled={!form.first || !form.phone || !agreedToTerms || payStep === "processing" || (addExtra && (extraDayIdx == null || extraHour == null || !extraService))}
                onClick={confirmBooking}
              >
                {barber.penaltyEnabled ? (
                  payStep === "processing" ? `Processing $${paymentAmount}…` : <><CreditCard size={16} /> Pay ${paymentAmount} & confirm</>
                ) : "Confirm booking — pay in person"}
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  /* ---- CONFIRMATION ---- */
  if (screen === "confirm" && lastBooking) {
    const totalPaid = lastBookings.reduce((s, lb) => s + lb.price, 0);
    const isLockedIn = lastBookings.some((lb) => lb.iso === calendar[0]?.iso);
    const isPending = lastBooking.status === "pending";
    const forfeitsOnCancel = isLockedIn && barber.penaltyEnabled;
    return (
      <div className="ap-stack ap-narrow">
        <div className="ap-confirm-icon" style={isPending ? { background: "var(--brass-soft)", color: "var(--brass)" } : undefined}>
          {isPending ? <AlertTriangle size={30} /> : <CheckCircle2 size={30} />}
        </div>
        <h2 className="ap-h2">{isPending ? "Awaiting barber confirmation" : "You're booked"}</h2>
        {isPending && (
          <p className="ap-muted-sm" style={{ textAlign: "center" }}>
            Your payment is held, but {barber.name} needs to confirm this one — your account has {lastBooking.flagReason}. You'll hear back soon.
          </p>
        )}
        <Ticket className="ap-summary ap-summary-vert">
          <p className="ap-mono">{barber.name} · {barber.shop}</p>
          {lastBookings.map((lb) => (
            <p key={lb.id}>{lb.service} — <span className="ap-mono">{lb.iso} {fmtTime(lb.hour)}</span></p>
          ))}
          <p className="ap-muted-sm ap-mono"><MapPin size={12} /> {lastBookings[0]?.address}</p>
          {barber.penaltyEnabled ? (
            <Pill tone={isPending ? "brass" : "sage"}>${totalPaid} paid — straight to {barber.name}</Pill>
          ) : (
            <Pill tone="slate">${totalPaid} due at the appointment — pay {barber.name} in person</Pill>
          )}
        </Ticket>

        {lastBookings.some((lb) => lb.recentMove) && (
          <div className="ap-notice">
            <AlertTriangle size={16} />
            <p>Note: this barber has recently changed their work location. Please double-check the address above before you go.</p>
          </div>
        )}

        {!isPending && (
          isLockedIn ? (
            <div className="ap-notice">
              <AlertTriangle size={16} />
              <p>
                {barber.penaltyEnabled
                  ? `This appointment is within 24 hours. You can still cancel, but the $${totalPaid} already paid stays with ${barber.name} — it won't be refunded.`
                  : "This appointment is within 24 hours. No payment was collected, so cancelling has no cost — but please give the barber a heads-up."}
              </p>
            </div>
          ) : (
            <ul className="ap-policy">
              <li>Change or cancel free of charge up to 24 hours before the appointment.</li>
              <li>{barber.penaltyEnabled ? "Inside 24 hours, cancelling forfeits the amount paid to the barber." : "This barber doesn't charge at booking, so there's no cancellation penalty either way."}</li>
              <li>A confirmation email is on its way to {form.email || "your inbox"}.</li>
            </ul>
          )
        )}

        {!isPending && showCancelForm && (
          <div className="ap-policy-box">
            <p className="ap-policy-box-title">Reason for cancelling</p>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={2}
              placeholder="Let the barber know why — this helps us keep the platform fair for everyone"
            />
            <p className="ap-muted-sm">
              {forfeitsOnCancel
                ? `This cancellation won't be refunded — the $${totalPaid} stays with ${barber.name}. It's still logged against your account.`
                : "Cancellations are logged against your account to help us watch for repeated last-minute changes."}
            </p>
          </div>
        )}

        <div className="ap-actions">
          {!isPending && !showCancelForm && (
            <button className="ap-btn ap-btn-outline" onClick={() => setShowCancelForm(true)}><Ban size={14} /> Cancel {lastBookings.length > 1 ? "these bookings" : "this booking"}</button>
          )}
          {!isPending && showCancelForm && (
            <>
              <button className="ap-btn ap-btn-ghost" onClick={() => { setShowCancelForm(false); setCancelReason(""); }}>Never mind</button>
              <button className="ap-btn ap-btn-outline" disabled={!cancelReason.trim()} onClick={cancelJustBooked}>Confirm cancellation</button>
            </>
          )}
          <button className="ap-btn ap-btn-primary" onClick={() => setScreen("search")}>Done</button>
        </div>
      </div>
    );
  }

  return null;
}

/* ============================ BARBER APP ============================ */

function BarberApp({ barbers, setBarbers, servicesByBarber, setServicesByBarber, photosByBarber, setPhotosByBarber, calendarByBarber, setCalendarByBarber, bookings, setBookings, rescheduleRequests, setRescheduleRequests, auditLog, notify, initialActiveId, logAudit }) {
  const [activeId, setActiveId] = useState(initialActiveId || barbers[0].id);
  const [tab, setTab] = useState("overview");
  const barber = barbers.find((b) => b.id === activeId);
  const services = servicesByBarber[activeId];
  const photos = photosByBarber[activeId] || [];
  const calendar = calendarByBarber[activeId];
  const myBookings = bookings.filter((b) => b.barberId === activeId).sort((a, b) => timeSortKey(a.iso, a.hour).localeCompare(timeSortKey(b.iso, b.hour)));
  const [calDayIdx, setCalDayIdx] = useState(1);
  const [showMoveForm, setShowMoveForm] = useState(false);
  const [moveForm, setMoveForm] = useState({ address: "", date: "" });
  const [editAddressBookingId, setEditAddressBookingId] = useState(null);
  const [editAddressValue, setEditAddressValue] = useState("");
  const [reportMode, setReportMode] = useState("all"); // all | day | month | year | range
  const [reportDay, setReportDay] = useState("");
  const [reportMonth, setReportMonth] = useState("");
  const [reportYear, setReportYear] = useState("");
  const [reportFrom, setReportFrom] = useState("");
  const [reportTo, setReportTo] = useState("");
  const [draftSettings, setDraftSettings] = useState(barber.calendarSettings || DEFAULT_CALENDAR_SETTINGS);
  const [newBreak, setNewBreak] = useState({ label: "Lunch", start: 12, end: 13 });
  const [calMonthOffset, setCalMonthOffset] = useState(0);
  const [penaltyAgreed, setPenaltyAgreed] = useState(false);
  const [penaltyPayStep, setPenaltyPayStep] = useState("idle");

  function activatePenaltyProgram() {
    setPenaltyPayStep("processing");
    setTimeout(() => {
      setBarbers((prev) => prev.map((b) => (b.id === activeId ? { ...b, penaltyEnabled: true, securityDeposit: PENALTY_DEPOSIT, penaltyHistory: [] } : b)));
      logAudit({ type: "cancellation_penalty_activated", actor: barber.name, barberId: activeId, after: { deposit: PENALTY_DEPOSIT } });
      notify(`Cancellation penalty program activated — $${PENALTY_DEPOSIT} deposit paid.`);
      setPenaltyPayStep("idle");
      setPenaltyAgreed(false);
    }, 900);
  }

  useEffect(() => { setDraftSettings(barber.calendarSettings || DEFAULT_CALENDAR_SETTINGS); }, [activeId]);

  function addBreakDraft() {
    setDraftSettings((s) => ({ ...s, breaks: [...s.breaks, { id: "br-" + Date.now(), ...newBreak }] }));
  }
  function removeBreakDraft(id) {
    setDraftSettings((s) => ({ ...s, breaks: s.breaks.filter((b) => b.id !== id) }));
  }
  function toggleWeeklyOffDraft(dow) {
    setDraftSettings((s) => ({ ...s, weeklyDaysOff: s.weeklyDaysOff.includes(dow) ? s.weeklyDaysOff.filter((d) => d !== dow) : [...s.weeklyDaysOff, dow] }));
  }
  function toggleHolidayDraft(id) {
    setDraftSettings((s) => ({ ...s, holidaysEnabled: { ...s.holidaysEnabled, [id]: !s.holidaysEnabled[id] } }));
  }
  function saveCalendarSettings() {
    const before = barber.calendarSettings;
    setBarbers((prev) => prev.map((b) => (b.id === activeId ? { ...b, calendarSettings: draftSettings } : b)));
    setCalendarByBarber((prev) => ({ ...prev, [activeId]: regenerateCalendarKeepingBookings(prev[activeId], barber.calendarSeed, planDays(barber), draftSettings) }));
    logAudit({ type: "calendar_settings_updated", actor: barber.name, before, after: draftSettings });
    notify("Calendar settings saved — future open slots now follow your new hours, duration, buffer, breaks, and days off.");
  }
  const [showProfileForm, setShowProfileForm] = useState(false);
  const [profileForm, setProfileForm] = useState({ name: "", phone: "", shop: "", bio: "" });
  const [profileError, setProfileError] = useState("");
  const [rescheduleFormBookingId, setRescheduleFormBookingId] = useState(null);
  const [rescheduleDayIdx, setRescheduleDayIdx] = useState(1);
  const [rescheduleHour, setRescheduleHour] = useState(null);
  const fieldSnapshot = useRef({});

  function openProfileEdit() {
    setProfileForm({ name: barber.name, phone: barber.phone, shop: barber.shop, bio: barber.bio || "" });
    setProfileError("");
    setShowProfileForm(true);
  }
  function saveProfile() {
    if (!isValidUSPhone(profileForm.phone)) {
      setProfileError("Enter a complete, valid 10-digit US mobile number.");
      return;
    }
    const before = { name: barber.name, phone: barber.phone, shop: barber.shop, bio: barber.bio };
    const after = { name: profileForm.name.trim(), phone: profileForm.phone, shop: profileForm.shop.trim(), bio: profileForm.bio.trim() };
    setBarbers((prev) => prev.map((b) => (b.id === activeId ? { ...b, ...after } : b)));
    const changed = {};
    Object.keys(after).forEach((k) => { if (before[k] !== after[k]) changed[k] = { from: before[k], to: after[k] }; });
    if (Object.keys(changed).length > 0) {
      logAudit({ type: "profile_updated", actor: after.name, before, after, meta: Object.keys(changed).join(", ") });
    }
    notify("Profile updated.");
    setShowProfileForm(false);
  }

  function snapshotField(key, value) {
    fieldSnapshot.current[key] = value;
  }
  function commitServiceField(s, field) {
    const key = `${s.id}:${field}`;
    const before = fieldSnapshot.current[key];
    const after = s[field];
    if (before !== undefined && before !== after) {
      logAudit({ type: field === "price" ? "service_price_changed" : "service_updated", actor: barber.name, before: { [field]: before }, after: { [field]: after }, meta: s.name });
    }
  }

  function scheduleMove() {
    if (!moveForm.address.trim() || !moveForm.date) return;
    const before = { address: barber.address, pendingMove: barber.pendingMove };
    setBarbers((prev) => prev.map((b) => (b.id === activeId ? { ...b, pendingMove: { newAddress: moveForm.address.trim(), effectiveDate: moveForm.date } } : b)));
    logAudit({ type: "location_change_scheduled", actor: barber.name, before, after: { newAddress: moveForm.address.trim(), effectiveDate: moveForm.date } });
    notify(`Move scheduled — your page will switch to the new address on ${moveForm.date}.`);
    setShowMoveForm(false);
    setMoveForm({ address: "", date: "" });
  }
  function cancelMove() {
    const before = barber.pendingMove;
    setBarbers((prev) => prev.map((b) => (b.id === activeId ? { ...b, pendingMove: null } : b)));
    logAudit({ type: "location_change_cancelled", actor: barber.name, before, after: null });
    notify("Scheduled move cancelled.");
  }
  function saveBookingAddress(bookingId) {
    const bk = bookings.find((x) => x.id === bookingId);
    setBookings((prev) => prev.map((b) => (b.id === bookingId ? { ...b, address: editAddressValue.trim(), addressEditedByBarber: true } : b)));
    logAudit({ type: "booking_address_edited", actor: barber.name, before: { address: bk?.address }, after: { address: editAddressValue.trim() }, meta: `booking ${bookingId}` });
    setEditAddressBookingId(null);
    setEditAddressValue("");
    notify("Address updated for that booking.");
  }

  function submitRescheduleRequest(bookingId) {
    if (rescheduleHour == null) return;
    const bk = bookings.find((x) => x.id === bookingId);
    const newDay = calendar[rescheduleDayIdx];
    const reqId = "rr-" + Date.now();
    setRescheduleRequests((prev) => [...prev, {
      id: reqId, bookingId, barberId: activeId,
      oldIso: bk.iso, oldHour: bk.hour, newIso: newDay.iso, newHour: rescheduleHour,
      status: "pending", requestedAt: new Date().toISOString(),
    }]);
    setBookings((prev) => prev.map((b) => (b.id === bookingId ? { ...b, pendingRescheduleId: reqId } : b)));
    logAudit({
      type: "booking_reschedule_requested", actor: barber.name, barberId: activeId,
      before: { iso: bk.iso, hour: bk.hour }, after: { iso: newDay.iso, hour: rescheduleHour },
      meta: `${bk.customerName}`,
    });
    notify(`Reschedule request sent to ${bk.customerName} — awaiting their response.`);
    setRescheduleFormBookingId(null);
    setRescheduleHour(null);
  }
  function withdrawRescheduleRequest(bookingId) {
    const bk = bookings.find((x) => x.id === bookingId);
    const req = rescheduleRequests.find((r) => r.id === bk.pendingRescheduleId);
    setRescheduleRequests((prev) => prev.map((r) => (r.id === bk.pendingRescheduleId ? { ...r, status: "withdrawn" } : r)));
    setBookings((prev) => prev.map((b) => (b.id === bookingId ? { ...b, pendingRescheduleId: null } : b)));
    logAudit({ type: "booking_reschedule_withdrawn", actor: barber.name, before: req, meta: bk.customerName });
    notify("Reschedule request withdrawn.");
  }

  function updateService(id, field, value) {
    const newVal = field === "name" ? value : Number(value) || 0;
    setServicesByBarber((prev) => ({ ...prev, [activeId]: prev[activeId].map((s) => (s.id === id ? { ...s, [field]: newVal } : s)) }));
  }
  function addService() {
    const newService = { id: "s" + Date.now(), name: "New service", price: 0, duration: 30 };
    setServicesByBarber((prev) => ({ ...prev, [activeId]: [...prev[activeId], newService] }));
    logAudit({ type: "service_added", actor: barber.name, after: newService });
  }
  function removeService(id) {
    const removed = services.find((s) => s.id === id);
    setServicesByBarber((prev) => ({ ...prev, [activeId]: prev[activeId].filter((s) => s.id !== id) }));
    logAudit({ type: "service_removed", actor: barber.name, before: removed });
  }
  function addPhoto() {
    setPhotosByBarber((prev) => {
      const current = prev[activeId] || [];
      if (current.length >= MAX_PHOTOS) return prev;
      return { ...prev, [activeId]: [...current, { id: "ph" + Date.now(), label: "New photo" }] };
    });
  }
  function updatePhotoLabel(id, label) {
    setPhotosByBarber((prev) => ({ ...prev, [activeId]: prev[activeId].map((p) => (p.id === id ? { ...p, label } : p)) }));
  }
  function removePhoto(id) {
    setPhotosByBarber((prev) => ({ ...prev, [activeId]: prev[activeId].filter((p) => p.id !== id) }));
  }
  function toggleBlockDay(iso) {
    let nowBlocked = false;
    setCalendarByBarber((prev) => {
      const copy = structuredClone(prev);
      const d = copy[activeId].find((x) => x.iso === iso);
      d.blocked = !d.blocked;
      nowBlocked = d.blocked;
      return copy;
    });
    logAudit({ type: nowBlocked ? "calendar_day_blocked" : "calendar_day_unblocked", actor: barber.name, meta: iso });
    notify("Day updated on your calendar.");
  }
  function toggleBlockSlot(iso, hour) {
    let newStatus = null;
    setCalendarByBarber((prev) => {
      const copy = structuredClone(prev);
      const d = copy[activeId].find((x) => x.iso === iso);
      const slot = d.slots.find((s) => s.hour === hour);
      if (slot.status === "open") slot.status = "blocked";
      else if (slot.status === "blocked") slot.status = "open";
      newStatus = slot.status;
      return copy;
    });
    logAudit({ type: newStatus === "blocked" ? "slot_blocked" : "slot_unblocked", actor: barber.name, meta: `${iso} ${fmtTime(hour)}` });
    notify("Time slot updated.");
  }
  function acceptPendingBooking(bookingId) {
    const bk = bookings.find((x) => x.id === bookingId);
    setBookings((prev) => prev.map((x) => (x.id === bookingId ? { ...x, status: "confirmed" } : x)));
    logAudit({ type: "booking_review_accepted", actor: barber.name, barberId: activeId, meta: `${bk.customerName} · ${bk.iso} ${fmtTime(bk.hour)}` });
    notify(`Booking with ${bk.customerName} accepted.`);
  }
  function declinePendingBooking(bookingId) {
    const bk = bookings.find((x) => x.id === bookingId);
    setBookings((prev) => prev.map((x) => (x.id === bookingId ? { ...x, status: "cancelled-by-barber", paymentStatus: "refunded" } : x)));
    setCalendarByBarber((prev) => {
      const copy = structuredClone(prev);
      const d = copy[activeId].find((x) => x.iso === bk.iso);
      const slot = d.slots.find((s) => s.hour === bk.hour);
      if (slot) { slot.status = "open"; slot.bookingId = null; }
      return copy;
    });
    logAudit({ type: "booking_review_declined", actor: barber.name, barberId: activeId, meta: `${bk.customerName} · ${bk.iso} ${fmtTime(bk.hour)}` });
    notify(`Booking declined — ${bk.customerName}'s $${bk.price} has been refunded in full.`);
  }
  function markNoShow(bookingId) {
    const b = bookings.find((x) => x.id === bookingId);
    const chargesUpfront = barber.penaltyEnabled;
    setBookings((prev) => prev.map((x) => (x.id === bookingId ? { ...x, status: "no-show", paymentStatus: chargesUpfront ? "paid-to-barber" : "not_charged" } : x)));
    logAudit({ type: "booking_no_show", actor: barber.name, barberId: activeId, before: { status: b.status, paymentStatus: b.paymentStatus }, after: { status: "no-show", paymentStatus: chargesUpfront ? "paid-to-barber" : "not_charged" }, meta: `${b.customerName} · ${b.iso} ${fmtTime(b.hour)}` });
    notify(chargesUpfront ? `Marked as no-show — the $${b.price} paid for this booking is now yours.` : "Marked as no-show.");
  }
  function markCancel(bookingId) {
    const bk = bookings.find((x) => x.id === bookingId);
    setBookings((prev) => prev.map((x) => (x.id === bookingId ? { ...x, status: "cancelled-by-barber", paymentStatus: "refunded" } : x)));
    setCalendarByBarber((prev) => {
      const copy = structuredClone(prev);
      const d = copy[activeId].find((x) => x.iso === bk.iso);
      const slot = d.slots.find((s) => s.hour === bk.hour);
      slot.status = "open";
      slot.bookingId = null;
      return copy;
    });
    logAudit({ type: "booking_cancelled_by_barber", actor: barber.name, barberId: activeId, before: { status: bk.status, paymentStatus: bk.paymentStatus }, after: { status: "cancelled-by-barber", paymentStatus: "refunded" }, meta: `${bk.customerName} · ${bk.iso} ${fmtTime(bk.hour)}` });
    const isInside24h = bk.iso === calendar[0]?.iso;
    if (barber.penaltyEnabled && isInside24h) {
      const amount = Math.min(PENALTY_PER_CANCELLATION, barber.securityDeposit);
      setBarbers((prev) => prev.map((b) => (b.id === activeId ? {
        ...b, securityDeposit: Math.max(0, b.securityDeposit - PENALTY_PER_CANCELLATION),
        penaltyHistory: [...b.penaltyHistory, { reason: `Cancelled within 24h · ${bk.customerName}`, amount, at: new Date().toISOString() }],
      } : b)));
      logAudit({ type: "cancellation_penalty_charged", actor: barber.name, barberId: activeId, after: { amount }, meta: `${bk.customerName} · ${bk.iso} ${fmtTime(bk.hour)}` });
      notify(`Booking cancelled — customer refunded $${bk.price}. Since this was inside 24h, $${PENALTY_PER_CANCELLATION} was deducted from your deposit.`);
    } else {
      notify(`Booking cancelled — the customer's $${bk.price} is refunded automatically, and they've been shown nearby barbers with a similar opening.`);
    }
  }

  const revenue = useMemo(() => {
    const completed = myBookings.filter((b) => b.status === "confirmed" || b.status === "no-show" || b.status === "completed");
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const monthKey = isoOf(today).slice(0, 7);
    const yearKey = isoOf(today).slice(0, 4);
    const daily = completed.filter((b) => b.iso === isoOf(today)).reduce((s, b) => s + b.price, 0);
    const monthly = completed.filter((b) => b.iso.slice(0, 7) === monthKey).reduce((s, b) => s + b.price, 0);
    const yearly = completed.filter((b) => b.iso.slice(0, 4) === yearKey).reduce((s, b) => s + b.price, 0);
    const cancellations = myBookings.filter((b) => b.status === "cancelled" || b.status === "cancelled-by-barber").length;
    const noShows = myBookings.filter((b) => b.status === "no-show").length;
    return { daily, monthly, yearly, cancellations, noShows };
  }, [myBookings]);

  const todayIso = isoOf(new Date());

  const reportRows = useMemo(() => {
    return myBookings.filter((b) => {
      if (reportMode === "day") return reportDay && b.iso === reportDay;
      if (reportMode === "month") return reportMonth && b.iso.slice(0, 7) === reportMonth;
      if (reportMode === "year") return reportYear && b.iso.slice(0, 4) === reportYear;
      if (reportMode === "range") {
        if (!reportFrom && !reportTo) return true;
        if (reportFrom && b.iso < reportFrom) return false;
        if (reportTo && b.iso > reportTo) return false;
        return true;
      }
      return true; // all
    }).sort((a, b) => timeSortKey(b.iso, b.hour).localeCompare(timeSortKey(a.iso, a.hour)));
  }, [myBookings, reportMode, reportDay, reportMonth, reportYear, reportFrom, reportTo]);

  const reportSummary = useMemo(() => {
    let completed = 0, cancelled = 0, revenueTotal = 0, refundedTotal = 0;
    reportRows.forEach((b) => {
      const st = derivedBookingStatus(b, todayIso);
      const pay = derivedPaymentStatus(b, todayIso);
      if (st === "Completed") completed += 1;
      if (st === "Cancelled") cancelled += 1;
      if (pay === "Paid") revenueTotal += b.price;
      if (pay === "Refunded") refundedTotal += b.price;
    });
    return { total: reportRows.length, completed, cancelled, revenueTotal, refundedTotal };
  }, [reportRows, todayIso]);

  function exportReportCSV() {
    const header = ["Appointment date", "Customer", "Service", "Amount", "Payment status", "Booking status"];
    const rows = reportRows.map((b) => [
      `${b.iso} ${fmtTime(b.hour)}`, b.customerName, b.service, `$${b.price}`,
      derivedPaymentStatus(b, todayIso), derivedBookingStatus(b, todayIso),
    ]);
    downloadCSV(`juloct-report-${barber.name.replace(/\s+/g, "-").toLowerCase()}-${todayIso}.csv`, [header, ...rows]);
  }

  const TABS = [
    { id: "overview", label: "Overview", icon: TrendingUp },
    { id: "services", label: "Services", icon: Scissors },
    { id: "photos", label: "Photos", icon: ImageIcon },
    { id: "calendar", label: "Calendar", icon: CalendarIcon },
    { id: "bookings", label: "Bookings", icon: ClipboardList },
    { id: "reports", label: "Reports", icon: FileText },
    { id: "settings", label: "Settings", icon: SettingsIcon },
  ];

  return (
    <div className="ap-stack">
      <div className="ap-barber-switch">
        <label>Viewing dashboard as</label>
        <select value={activeId} onChange={(e) => { setActiveId(e.target.value); setTab("overview"); }}>
          {barbers.map((b) => <option key={b.id} value={b.id}>{b.name} — {b.shop}</option>)}
        </select>
      </div>

      {barber.subscription.status === "grace" && (
        <div className="ap-notice ap-notice-crimson">
          <AlertTriangle size={16} />
          <p><strong>Your subscription lapsed.</strong> You're in the 7-day grace period — full dashboard access continues, but your profile is still bookable. Renews or hides from search after the grace period ends ({barber.subscription.renewsOn}).</p>
        </div>
      )}

      <div className="ap-tabbar">
        {TABS.map((t) => (
          <button key={t.id} className={`ap-tab ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <>
          <div className="ap-stat-row">
            <Ticket className="ap-stat"><span className="ap-muted-sm">Today</span><span className="ap-mono ap-price">${revenue.daily}</span></Ticket>
            <Ticket className="ap-stat"><span className="ap-muted-sm">This month</span><span className="ap-mono ap-price">${revenue.monthly}</span></Ticket>
            <Ticket className="ap-stat"><span className="ap-muted-sm">This year</span><span className="ap-mono ap-price">${revenue.yearly}</span></Ticket>
            <Ticket className="ap-stat"><span className="ap-muted-sm">Cancellations</span><span className="ap-mono ap-price">{revenue.cancellations}</span></Ticket>
            <Ticket className="ap-stat"><span className="ap-muted-sm">No-shows</span><span className="ap-mono ap-price">{revenue.noShows}</span></Ticket>
          </div>
        </>
      )}

      {tab === "services" && (
        <>
          <h4 className="ap-section-label">Your services</h4>
          <div className="ap-service-table">
            <div className="ap-service-row ap-service-head">
              <span>Description</span><span>Price</span><span>Duration (min)</span><span />
            </div>
            {services.map((s) => (
              <div className="ap-service-row" key={s.id}>
                <input
                  value={s.name}
                  onFocus={() => snapshotField(`${s.id}:name`, s.name)}
                  onChange={(e) => updateService(s.id, "name", e.target.value)}
                  onBlur={() => commitServiceField(s, "name")}
                />
                <div className="ap-input-prefix">
                  <span>$</span>
                  <input
                    type="number"
                    value={s.price}
                    onFocus={() => snapshotField(`${s.id}:price`, s.price)}
                    onChange={(e) => updateService(s.id, "price", e.target.value)}
                    onBlur={() => commitServiceField(s, "price")}
                  />
                </div>
                <input
                  type="number"
                  value={s.duration}
                  onFocus={() => snapshotField(`${s.id}:duration`, s.duration)}
                  onChange={(e) => updateService(s.id, "duration", e.target.value)}
                  onBlur={() => commitServiceField(s, "duration")}
                />
                <button className="ap-icon-btn" onClick={() => removeService(s.id)}><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
          <button className="ap-btn ap-btn-outline" onClick={addService}><Plus size={14} /> Add service</button>
        </>
      )}

      {tab === "photos" && (
        <>
          <h4 className="ap-section-label">Your photos ({photos.length}/{MAX_PHOTOS})</h4>
          <p className="ap-muted-sm">Add up to six — a shot of yourself, your chair, and the shop. These rotate as a slideshow on your card on the homepage.</p>
          <div className="ap-photo-grid">
            {photos.map((p, i) => (
              <div key={p.id} className="ap-photo-manage-card">
                <div className="ap-photo ap-photo-thumb" style={{ background: `linear-gradient(160deg, hsl(${(barber.photoHue + i * 22) % 360} 35% 22%), hsl(${(barber.photoHue + i * 22) % 360} 25% 12%))` }}>
                  <Scissors size={20} />
                </div>
                <input value={p.label} onChange={(e) => updatePhotoLabel(p.id, e.target.value)} placeholder="e.g. My chair" />
                <button className="ap-icon-btn" onClick={() => removePhoto(p.id)}><Trash2 size={14} /></button>
              </div>
            ))}
            {photos.length < MAX_PHOTOS && (
              <button className="ap-photo-add" onClick={addPhoto}>
                <Plus size={18} />
                <span>Add photo</span>
              </button>
            )}
          </div>
        </>
      )}

      {tab === "calendar" && (() => {
        const months = Array.from(new Set(calendar.map((d) => d.iso.slice(0, 7))));
        const monthKeyNow = months[Math.min(calMonthOffset, months.length - 1)];
        const daysInMonth = calendar.filter((d) => d.iso.slice(0, 7) === monthKeyNow);
        const monthLabel = daysInMonth[0] ? daysInMonth[0].date.toLocaleDateString("en-US", { month: "long", year: "numeric" }) : "";
        return (
        <>
          <h4 className="ap-section-label">
            Calendar <span className="ap-muted-sm">({planDays(barber)}-day view — {barber.subscription?.plan?.split(" · ")[0] || "Monthly"} plan)</span>
          </h4>
          <div className="ap-month-nav">
            <button className="ap-icon-btn" disabled={calMonthOffset === 0} onClick={() => setCalMonthOffset((o) => Math.max(0, o - 1))}><ChevronLeft size={18} /></button>
            <span className="ap-mono">{monthLabel}</span>
            <button className="ap-icon-btn" disabled={calMonthOffset >= months.length - 1} onClick={() => setCalMonthOffset((o) => Math.min(months.length - 1, o + 1))}><ChevronRight size={18} /></button>
          </div>
          <div className="ap-day-strip">
            {daysInMonth.map((d) => {
              const realIdx = calendar.findIndex((c) => c.iso === d.iso);
              return (
                <button key={d.iso} className={`ap-day-chip ${realIdx === calDayIdx ? "active" : ""} ${d.blocked ? "disabled" : ""}`} onClick={() => setCalDayIdx(realIdx)}>
                  <span className="ap-mono">{fmtDate(d.date)}</span>
                  {d.blocked && <Pill tone="slate">blocked</Pill>}
                </button>
              );
            })}
          </div>
          <div className="ap-actions" style={{ marginBottom: 10 }}>
            <button className="ap-btn ap-btn-outline" onClick={() => toggleBlockDay(calendar[calDayIdx].iso)}>
              {calendar[calDayIdx].blocked ? "Unblock this day" : "Block this day"}
            </button>
          </div>
          <div className="ap-slot-grid">
            {calendar[calDayIdx].slots.map((s) => {
              const bk = s.bookingId ? bookings.find((b) => b.id === s.bookingId) : null;
              return (
                <div key={s.hour} className={`ap-slot-card ${s.status}`}>
                  <span className="ap-mono">{fmtTime(s.hour)}</span>
                  {s.status === "open" && <span className="ap-muted-sm">Open</span>}
                  {s.status === "booked" && bk && <span className="ap-muted-sm">{bk.customerName}</span>}
                  {s.status === "blocked" && <span className="ap-muted-sm">Blocked</span>}
                  {(s.status === "open" || s.status === "blocked") && (
                    <button className="ap-slot-block-btn" onClick={() => toggleBlockSlot(calendar[calDayIdx].iso, s.hour)}>
                      {s.status === "blocked" ? "Unblock" : "Block this time"}
                    </button>
                  )}
                </div>
              );
            })}
            {calendar[calDayIdx].slots.length === 0 && <p className="ap-muted-sm">No working hours this day (holiday, weekly day off, or fully blocked).</p>}
          </div>
          <p className="ap-muted-sm">Once a slot is booked, it locks — you can request a one-time reschedule instead of editing it directly. Customers can only see and book the next 3 weeks of this calendar; the rest is for your own planning.</p>
        </>
        );
      })()}

      {tab === "bookings" && (
        <>
          <h4 className="ap-section-label">All bookings</h4>
          <div className="ap-list">
            {myBookings.length === 0 && <p className="ap-muted-sm">No bookings yet.</p>}
            {myBookings.map((b) => (
              <React.Fragment key={b.id}>
              <div className="ap-list-row ap-booking-row">
                <div>
                  <p>{b.customerName} <span className="ap-muted-sm">· {b.service}</span></p>
                  <p className="ap-mono ap-muted-sm">{b.iso} {fmtTime(b.hour)}</p>
                  {editAddressBookingId === b.id ? (
                    <div className="ap-inline-edit">
                      <input value={editAddressValue} onChange={(e) => setEditAddressValue(e.target.value)} />
                      <button className="ap-btn ap-btn-tiny ap-btn-primary" onClick={() => saveBookingAddress(b.id)}>Save</button>
                      <button className="ap-btn ap-btn-tiny ap-btn-ghost" onClick={() => setEditAddressBookingId(null)}>Cancel</button>
                    </div>
                  ) : (
                    <p className="ap-mono ap-muted-sm">
                      <MapPin size={11} /> {b.address}
                      <button className="ap-slot-block-btn" style={{ marginLeft: 8, display: "inline" }} onClick={() => { setEditAddressBookingId(b.id); setEditAddressValue(b.address || ""); }}>Edit address</button>
                    </p>
                  )}
                </div>
                <div className="ap-booking-right">
                  {b.status === "confirmed" && <Pill tone="sage">confirmed</Pill>}
                  {b.status === "pending" && <Pill tone="brass">pending your review</Pill>}
                  {b.status === "no-show" && <Pill tone="crimson">no-show</Pill>}
                  {b.status === "cancelled" && <Pill tone="slate">cancelled by customer</Pill>}
                  {b.status === "cancelled-by-barber" && <Pill tone="slate">cancelled by you</Pill>}
                  {b.status === "pending" && (
                    <div className="ap-pending-review">
                      <p className="ap-muted-sm">⚠️ {b.flagReason}. Accept this booking?</p>
                      <div className="ap-row-actions">
                        <button className="ap-btn ap-btn-tiny ap-btn-primary" onClick={() => acceptPendingBooking(b.id)}>Accept</button>
                        <button className="ap-btn ap-btn-tiny ap-btn-outline" onClick={() => declinePendingBooking(b.id)}>Decline</button>
                      </div>
                    </div>
                  )}
                  {b.status === "confirmed" && !b.pendingRescheduleId && (
                    <div className="ap-row-actions">
                      <button className="ap-btn ap-btn-tiny ap-btn-outline" onClick={() => { setRescheduleFormBookingId(b.id); setRescheduleDayIdx(1); setRescheduleHour(null); }}>Request new time</button>
                      <button className="ap-btn ap-btn-tiny ap-btn-outline" onClick={() => markNoShow(b.id)}>Mark no-show</button>
                      <button className="ap-btn ap-btn-tiny ap-btn-ghost" onClick={() => markCancel(b.id)}>Cancel</button>
                    </div>
                  )}
                  {b.pendingRescheduleId && (() => {
                    const req = rescheduleRequests.find((r) => r.id === b.pendingRescheduleId);
                    return req ? (
                      <div className="ap-reschedule-pending">
                        <Pill tone="brass">Awaiting customer</Pill>
                        <p className="ap-muted-sm ap-mono">→ {req.newIso} {fmtTime(req.newHour)}</p>
                        <button className="ap-btn ap-btn-tiny ap-btn-ghost" onClick={() => withdrawRescheduleRequest(b.id)}>Withdraw</button>
                      </div>
                    ) : null;
                  })()}
                </div>
              </div>
              {rescheduleFormBookingId === b.id && (
                <div className="ap-policy-box" style={{ marginTop: 8 }}>
                  <p className="ap-policy-box-title">Propose a new time for {b.customerName}</p>
                  <div className="ap-day-strip">
                    {calendar.slice(0, 60).map((d, i) => (
                      <button key={d.iso} disabled={d.blocked} className={`ap-day-chip ${i === rescheduleDayIdx ? "active" : ""} ${d.blocked ? "disabled" : ""}`} onClick={() => { setRescheduleDayIdx(i); setRescheduleHour(null); }}>
                        <span className="ap-mono">{fmtDate(d.date)}</span>
                        {d.blocked && <Pill tone="slate">closed</Pill>}
                      </button>
                    ))}
                  </div>
                  <div className="ap-slot-grid">
                    {calendar[rescheduleDayIdx].slots.map((s) => (
                      <button key={s.hour} disabled={s.status !== "open"} className={`ap-slot ${rescheduleHour === s.hour ? "active" : ""} ${s.status !== "open" ? "taken" : ""}`} onClick={() => setRescheduleHour(s.hour)}>
                        {fmtTime(s.hour)}
                      </button>
                    ))}
                  </div>
                  <div className="ap-actions" style={{ justifyContent: "flex-end" }}>
                    <button className="ap-btn ap-btn-outline" onClick={() => setRescheduleFormBookingId(null)}>Cancel</button>
                    <button className="ap-btn ap-btn-primary" disabled={rescheduleHour == null} onClick={() => submitRescheduleRequest(b.id)}>Send request</button>
                  </div>
                </div>
              )}
              </React.Fragment>
            ))}
          </div>
        </>
      )}

      {tab === "reports" && (
        <>
          <h4 className="ap-section-label">Filter</h4>
          <div className="ap-report-filters">
            <div className="ap-segmented ap-report-mode">
              {[["all", "All time"], ["day", "Day"], ["month", "Month"], ["year", "Year"], ["range", "Range"]].map(([id, label]) => (
                <button key={id} className={reportMode === id ? "active" : ""} onClick={() => setReportMode(id)}>{label}</button>
              ))}
            </div>
            {reportMode === "day" && <input type="date" value={reportDay} onChange={(e) => setReportDay(e.target.value)} />}
            {reportMode === "month" && <input type="month" value={reportMonth} onChange={(e) => setReportMonth(e.target.value)} />}
            {reportMode === "year" && (
              <div className="ap-select-wrap" style={{ maxWidth: 140 }}>
                <select className="ap-select-fancy" value={reportYear} onChange={(e) => setReportYear(e.target.value)}>
                  <option value="">Select year</option>
                  {[0, 1, 2].map((i) => { const y = new Date().getFullYear() - i; return <option key={y} value={String(y)}>{y}</option>; })}
                </select>
                <ChevronDown size={15} className="ap-select-chevron" />
              </div>
            )}
            {reportMode === "range" && (
              <div className="ap-report-range">
                <div className="ap-field"><label>From</label><input type="date" value={reportFrom} onChange={(e) => setReportFrom(e.target.value)} /></div>
                <div className="ap-field"><label>To</label><input type="date" value={reportTo} onChange={(e) => setReportTo(e.target.value)} /></div>
              </div>
            )}
          </div>

          <div className="ap-stat-row">
            <Ticket className="ap-stat"><span className="ap-muted-sm">Total bookings</span><span className="ap-mono ap-price">{reportSummary.total}</span></Ticket>
            <Ticket className="ap-stat"><span className="ap-muted-sm">Completed</span><span className="ap-mono ap-price">{reportSummary.completed}</span></Ticket>
            <Ticket className="ap-stat"><span className="ap-muted-sm">Cancelled</span><span className="ap-mono ap-price">{reportSummary.cancelled}</span></Ticket>
            <Ticket className="ap-stat"><span className="ap-muted-sm">Total revenue</span><span className="ap-mono ap-price">${reportSummary.revenueTotal}</span></Ticket>
            <Ticket className="ap-stat"><span className="ap-muted-sm">Total refunded</span><span className="ap-mono ap-price">${reportSummary.refundedTotal}</span></Ticket>
          </div>

          <div className="ap-actions">
            <button className="ap-btn ap-btn-outline" onClick={() => window.print()}><Printer size={14} /> Print</button>
            <button className="ap-btn ap-btn-outline" onClick={exportReportCSV}><Download size={14} /> Download CSV</button>
          </div>

          <div className="ap-report-table">
            <div className="ap-report-row ap-report-head-row">
              <span>Date</span><span>Customer</span><span>Service</span><span>Amount</span><span>Payment</span><span>Status</span>
            </div>
            {reportRows.length === 0 && <p className="ap-muted-sm">No bookings in this range.</p>}
            {reportRows.map((b) => {
              const st = derivedBookingStatus(b, todayIso);
              const pay = derivedPaymentStatus(b, todayIso);
              return (
                <div className="ap-report-row" key={b.id}>
                  <span className="ap-mono">{b.iso} {fmtTime(b.hour)}</span>
                  <span>{b.customerName}</span>
                  <span>{b.service}</span>
                  <span className="ap-mono">${b.price}</span>
                  <span><Pill tone={pay === "Refunded" ? "crimson" : pay === "Paid" ? "sage" : "brass"}>{pay}</Pill></span>
                  <span><Pill tone={st === "Completed" ? "sage" : st === "Cancelled" ? "slate" : st === "No Show" ? "crimson" : "brass"}>{st}</Pill></span>
                </div>
              );
            })}
          </div>

          <p className="ap-muted-sm">This report reflects activity recorded in JULOCT for your own records or performance tracking — it isn't issued as an official tax document.</p>
        </>
      )}

      {tab === "settings" && (
        <>
          <h4 className="ap-section-label">Profile</h4>
          <Ticket className="ap-settings-row">
            <div>
              <p>{barber.name} · {barber.shop}</p>
              <p className="ap-muted-sm ap-mono">{barber.phone}</p>
              {barber.bio && <p className="ap-muted-sm">{barber.bio}</p>}
            </div>
            {!showProfileForm && <button className="ap-btn ap-btn-outline" onClick={openProfileEdit}>Edit profile</button>}
          </Ticket>

          {showProfileForm && (
            <div className="ap-policy-box">
              <p className="ap-policy-box-title">Edit profile</p>
              <div className="ap-form-grid">
                <div className="ap-field"><label>Your name</label><input value={profileForm.name} onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })} /></div>
                <div className="ap-field"><label>Shop name</label><input value={profileForm.shop} onChange={(e) => setProfileForm({ ...profileForm, shop: e.target.value })} /></div>
                <div className="ap-field">
                  <label><Phone size={12} /> Mobile phone</label>
                  <input value={profileForm.phone} onChange={(e) => setProfileForm({ ...profileForm, phone: formatPhoneDigits(e.target.value) })} inputMode="numeric" maxLength={14} />
                </div>
                <div className="ap-field ap-field-wide"><label>Bio</label><textarea rows={2} value={profileForm.bio} onChange={(e) => setProfileForm({ ...profileForm, bio: e.target.value })} /></div>
              </div>
              {profileError && <p className="ap-error"><XCircle size={14} /> {profileError}</p>}
              <div className="ap-actions" style={{ justifyContent: "flex-end" }}>
                <button className="ap-btn ap-btn-outline" onClick={() => setShowProfileForm(false)}>Cancel</button>
                <button className="ap-btn ap-btn-primary" onClick={saveProfile}>Save changes</button>
              </div>
            </div>
          )}

          <h4 className="ap-section-label">Working hours &amp; calendar rules</h4>
          <p className="ap-muted-sm">These apply to future open slots — anything already booked stays exactly as it is.</p>
          <div className="ap-calrules-box">
            <div className="ap-form-grid">
              <div className="ap-field">
                <label>Start time</label>
                <div className="ap-select-wrap">
                  <select className="ap-select-fancy" value={draftSettings.workingHours.start} onChange={(e) => setDraftSettings((s) => ({ ...s, workingHours: { ...s.workingHours, start: Number(e.target.value) } }))}>
                    {Array.from({ length: 15 }, (_, i) => i + 6).map((h) => <option key={h} value={h}>{fmtTime(h)}</option>)}
                  </select>
                  <ChevronDown size={15} className="ap-select-chevron" />
                </div>
              </div>
              <div className="ap-field">
                <label>End time</label>
                <div className="ap-select-wrap">
                  <select className="ap-select-fancy" value={draftSettings.workingHours.end} onChange={(e) => setDraftSettings((s) => ({ ...s, workingHours: { ...s.workingHours, end: Number(e.target.value) } }))}>
                    {Array.from({ length: 15 }, (_, i) => i + 7).map((h) => <option key={h} value={h}>{fmtTime(h)}</option>)}
                  </select>
                  <ChevronDown size={15} className="ap-select-chevron" />
                </div>
              </div>
              <div className="ap-field">
                <label>Appointment slot length</label>
                <div className="ap-select-wrap">
                  <select className="ap-select-fancy" value={draftSettings.slotDurationMinutes} onChange={(e) => setDraftSettings((s) => ({ ...s, slotDurationMinutes: Number(e.target.value) }))}>
                    {[15, 20, 30, 45, 60].map((m) => <option key={m} value={m}>{m} min</option>)}
                  </select>
                  <ChevronDown size={15} className="ap-select-chevron" />
                </div>
              </div>
              <div className="ap-field">
                <label>Buffer between customers</label>
                <div className="ap-select-wrap">
                  <select className="ap-select-fancy" value={draftSettings.bufferMinutes} onChange={(e) => setDraftSettings((s) => ({ ...s, bufferMinutes: Number(e.target.value) }))}>
                    {[0, 5, 10, 15, 20, 30].map((m) => <option key={m} value={m}>{m === 0 ? "No buffer" : `${m} min`}</option>)}
                  </select>
                  <ChevronDown size={15} className="ap-select-chevron" />
                </div>
              </div>
            </div>

            <p className="ap-policy-box-title" style={{ marginTop: 6 }}>Breaks</p>
            {draftSettings.breaks.length === 0 && <p className="ap-muted-sm">No recurring breaks set.</p>}
            {draftSettings.breaks.map((b) => (
              <div className="ap-break-row" key={b.id}>
                <span>{b.label}</span>
                <span className="ap-mono ap-muted-sm">{fmtTime(b.start)} – {fmtTime(b.end)}</span>
                <button className="ap-icon-btn" onClick={() => removeBreakDraft(b.id)}><Trash2 size={14} /></button>
              </div>
            ))}
            <div className="ap-break-add-row">
              <div className="ap-select-wrap" style={{ maxWidth: 150 }}>
                <select className="ap-select-fancy" value={newBreak.label} onChange={(e) => setNewBreak({ ...newBreak, label: e.target.value })}>
                  {BREAK_LABELS.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
                <ChevronDown size={15} className="ap-select-chevron" />
              </div>
              <div className="ap-select-wrap" style={{ maxWidth: 110 }}>
                <select className="ap-select-fancy" value={newBreak.start} onChange={(e) => setNewBreak({ ...newBreak, start: Number(e.target.value) })}>
                  {Array.from({ length: 15 }, (_, i) => i + 6).map((h) => <option key={h} value={h}>{fmtTime(h)}</option>)}
                </select>
                <ChevronDown size={15} className="ap-select-chevron" />
              </div>
              <span className="ap-muted-sm">to</span>
              <div className="ap-select-wrap" style={{ maxWidth: 110 }}>
                <select className="ap-select-fancy" value={newBreak.end} onChange={(e) => setNewBreak({ ...newBreak, end: Number(e.target.value) })}>
                  {Array.from({ length: 15 }, (_, i) => i + 6).map((h) => <option key={h} value={h}>{fmtTime(h)}</option>)}
                </select>
                <ChevronDown size={15} className="ap-select-chevron" />
              </div>
              <button className="ap-btn ap-btn-tiny ap-btn-outline" onClick={addBreakDraft}><Plus size={12} /> Add break</button>
            </div>

            <p className="ap-policy-box-title" style={{ marginTop: 6 }}>Weekly days off</p>
            <div className="ap-segmented ap-weekday-picker">
              {WEEKDAYS.map((w) => (
                <button key={w.id} className={draftSettings.weeklyDaysOff.includes(w.id) ? "active" : ""} onClick={() => toggleWeeklyOffDraft(w.id)}>{w.label}</button>
              ))}
            </div>

            <p className="ap-policy-box-title" style={{ marginTop: 6 }}>Public holidays</p>
            <div className="ap-holiday-grid">
              {HOLIDAYS.map((h) => (
                <label className="ap-checkbox ap-holiday-row" key={h.id}>
                  <input type="checkbox" checked={!!draftSettings.holidaysEnabled[h.id]} onChange={() => toggleHolidayDraft(h.id)} />
                  <span>{h.label} <span className="ap-muted-sm ap-mono">{h.date}</span></span>
                </label>
              ))}
            </div>

            <div className="ap-actions" style={{ justifyContent: "flex-end" }}>
              <button className="ap-btn ap-btn-primary" onClick={saveCalendarSettings}>Save calendar settings</button>
            </div>
          </div>

          <h4 className="ap-section-label">Payments</h4>
          <Ticket className="ap-settings-row">
            <div>
              <p>Customers pay in full at booking</p>
              <p className="ap-muted-sm">The service price is charged and held at booking time. It's released back to the customer if they change or cancel 24h+ ahead, and paid to you if they no-show.</p>
            </div>
          </Ticket>

          <h4 className="ap-section-label">Cancellations</h4>
          <Ticket className="ap-settings-row">
            <div>
              <p>Cancelled slots reopen immediately</p>
              <p className="ap-muted-sm">
                When a customer cancels with 24h+ notice, that time is published as open right away so anyone can grab it — no waiting around. You can still block a time yourself from the Calendar tab if you need to.
              </p>
            </div>
          </Ticket>

          <h4 className="ap-section-label">Customer cancellation cash penalty</h4>
          {!barber.penaltyEnabled ? (
            <div className="ap-calrules-box">
              <p className="ap-muted-sm">
                Turn this on to have customers pay the full price at booking (straight to you) instead of paying in person later. Because it raises the stakes for them, it raises the stakes for you too — read carefully before activating.
              </p>
              <div className="ap-policy-box">
                <p className="ap-policy-box-title">Terms of activation</p>
                <p style={{ fontSize: 13 }}>
                  With this on, customers pay the full service price at booking, sent straight to you. Before 24 hours out, either side can cancel or change with no penalty at all. Inside 24 hours: if the customer cancels or doesn't show, the amount they paid is yours to keep. If you cancel a confirmed booking inside that window — or a reschedule you request gets declined and the booking ends up cancelled — <strong>${PENALTY_PER_CANCELLATION} per cancelled booking</strong> is deducted from a required <strong>${PENALTY_DEPOSIT} security deposit</strong>, held and managed by JULOCT. Activating this feature requires paying that ${PENALTY_DEPOSIT} deposit up front. Every cancellation, change, and no-show is recorded either way, whether this is on or off. Paying the deposit and activating this feature means you fully accept these terms.
                </p>
                <label className="ap-checkbox">
                  <input type="checkbox" checked={penaltyAgreed} onChange={(e) => setPenaltyAgreed(e.target.checked)} />
                  I agree to the terms above
                </label>
              </div>
              <div className="ap-actions" style={{ justifyContent: "flex-end" }}>
                <button
                  className="ap-btn ap-btn-primary"
                  disabled={!penaltyAgreed || penaltyPayStep === "processing"}
                  onClick={activatePenaltyProgram}
                >
                  {penaltyPayStep === "processing" ? "Processing payment…" : <><CreditCard size={16} /> Pay ${PENALTY_DEPOSIT} deposit & activate</>}
                </button>
              </div>
            </div>
          ) : (
            <>
              <Ticket className="ap-settings-row">
                <div>
                  <p>Active — customers see a cancellation-penalty notice at booking</p>
                  <p className="ap-muted-sm">Security deposit balance</p>
                </div>
                <Pill tone={barber.securityDeposit > 100 ? "sage" : "crimson"}>${barber.securityDeposit} remaining</Pill>
              </Ticket>
              {barber.penaltyHistory.length > 0 && (
                <div className="ap-admin-table">
                  <div className="ap-admin-row ap-geo-head-row"><span>Reason</span><span>Amount</span><span>Date</span></div>
                  {barber.penaltyHistory.map((h, i) => (
                    <div className="ap-admin-row ap-geo-row" key={i}><span>{h.reason}</span><span className="ap-mono">-${h.amount}</span><span className="ap-mono ap-muted-sm">{new Date(h.at).toLocaleDateString()}</span></div>
                  ))}
                </div>
              )}
            </>
          )}

          <h4 className="ap-section-label">Location</h4>
          <Ticket className="ap-settings-row">
            <div>
              <p>Current address</p>
              <p className="ap-muted-sm ap-mono">{currentAddressOf(barber)}</p>
            </div>
            {!showMoveForm && !barber.pendingMove && (
              <button className="ap-btn ap-btn-outline" onClick={() => setShowMoveForm(true)}>Change location</button>
            )}
          </Ticket>

          {barber.pendingMove && (
            <div className="ap-notice ap-notice-sage">
              <CheckCircle2 size={16} />
              <div>
                <p><strong>Move scheduled.</strong> Switching to <span className="ap-mono">{barber.pendingMove.newAddress}</span> on {barber.pendingMove.effectiveDate}.</p>
                <p className="ap-muted-sm">Until then, everyone still sees your current address. Bookings already made keep whichever address was active when the customer booked.</p>
                <button className="ap-btn ap-btn-tiny ap-btn-ghost" onClick={cancelMove}>Cancel this move</button>
              </div>
            </div>
          )}

          {showMoveForm && (
            <div className="ap-policy-box">
              <p className="ap-policy-box-title">Schedule a location change</p>
              <div className="ap-field">
                <label>New address</label>
                <input value={moveForm.address} onChange={(e) => setMoveForm({ ...moveForm, address: e.target.value })} placeholder="200 New St, Birmingham, MI 48009" />
              </div>
              <div className="ap-field">
                <label>Effective date</label>
                <input type="date" value={moveForm.date} min={isoOf(new Date())} onChange={(e) => setMoveForm({ ...moveForm, date: e.target.value })} />
              </div>
              <p className="ap-muted-sm">Before this date, your page keeps showing the current address. From this date on, open slots and new bookings switch to the new one automatically — past bookings aren't affected.</p>
              <div className="ap-actions" style={{ justifyContent: "flex-end" }}>
                <button className="ap-btn ap-btn-outline" onClick={() => setShowMoveForm(false)}>Cancel</button>
                <button className="ap-btn ap-btn-primary" disabled={!moveForm.address.trim() || !moveForm.date} onClick={scheduleMove}>Schedule move</button>
              </div>
            </div>
          )}

          <h4 className="ap-section-label">Subscription</h4>
          <Ticket className="ap-settings-row">
            <div>
              <p>{barber.subscription.plan}</p>
              <p className="ap-muted-sm">Status: {barber.subscription.status} · Renews {barber.subscription.renewsOn}</p>
            </div>
            <Pill tone={barber.subscription.status === "active" ? "sage" : "crimson"}>{barber.subscription.status}</Pill>
          </Ticket>
        </>
      )}
    </div>
  );
}

/* ============================ ADMIN APP ============================ */

function BarberAuthApp({
  barbers, setBarbers, servicesByBarber, setServicesByBarber, photosByBarber, setPhotosByBarber,
  calendarByBarber, setCalendarByBarber, barberAccounts, setBarberAccounts, onLoggedIn, notify, logAudit,
}) {
  const [mode, setMode] = useState("login"); // login | register
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [loginError, setLoginError] = useState("");

  const [regForm, setRegForm] = useState({
    name: "", shop: "", address: "", city: "", state: "", gender: "", referralSource: "", phone: "", email: "", password: "", confirm: "",
  });
  const [regError, setRegError] = useState("");
  const [agreedRules, setAgreedRules] = useState(() => Array(BARBER_TERMS.length).fill(false));
  const allAgreed = agreedRules.every(Boolean);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [payStep, setPayStep] = useState("idle"); // idle | processing | done

  function handleLogin() {
    setLoginError("");
    const account = barberAccounts.find((a) => a.email.toLowerCase() === loginForm.email.trim().toLowerCase());
    if (!account || account.password !== loginForm.password) {
      setLoginError("Incorrect email or password.");
      return;
    }
    const b = barbers.find((x) => x.id === account.barberId);
    logAudit({ type: "login", actor: b?.name || account.barberId, meta: account.email });
    onLoggedIn(account.barberId);
  }

  function handleRegister() {
    setRegError("");
    if (regForm.password.length < 8) {
      setRegError("Password must be at least 8 characters.");
      return;
    }
    if (regForm.password !== regForm.confirm) {
      setRegError("Passwords don't match.");
      return;
    }
    if (!isValidUSPhone(regForm.phone)) {
      setRegError("Enter a complete, valid 10-digit US mobile number.");
      return;
    }
    if (barberAccounts.some((a) => a.email.toLowerCase() === regForm.email.trim().toLowerCase())) {
      setRegError("An account with this email already exists — try logging in instead.");
      return;
    }
    if (!selectedPlan) {
      setRegError("Pick a membership plan to continue.");
      return;
    }
    if (!allAgreed) {
      setRegError("Please read and check all 12 terms to continue.");
      return;
    }

    setPayStep("processing");
    setTimeout(() => {
      const id = "b" + Date.now();
      const plan = PLANS.find((p) => p.id === selectedPlan);
      const newBarber = {
        id, name: regForm.name, shop: regForm.shop, zip: "", city: regForm.city, state: regForm.state,
        address: regForm.address, pendingMove: null, gender: regForm.gender, referralSource: regForm.referralSource,
        phone: regForm.phone, bio: "", accountStatus: "active", photoHue: Math.floor(Math.random() * 360),
        createdAt: new Date().toISOString(),
        calendarSeed: Math.floor(Math.random() * 1000) + 4,
        calendarSettings: { ...DEFAULT_CALENDAR_SETTINGS, breaks: [{ id: "br-" + Date.now(), label: "Lunch", start: 12, end: 13 }] },
        penaltyEnabled: false, securityDeposit: 0, penaltyHistory: [],
        subscription: { plan: `${plan.label} · $${plan.price}${plan.cadence === "one-time" ? "" : plan.cadence}`, status: "active", renewsOn: addMonths(new Date(), plan.months).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) },
      };
      setBarbers((prev) => [...prev, newBarber]);
      setServicesByBarber((prev) => ({ ...prev, [id]: [] }));
      setPhotosByBarber((prev) => ({ ...prev, [id]: [] }));
      setCalendarByBarber((prev) => ({ ...prev, [id]: buildCalendar(newBarber.calendarSeed, planDays(newBarber), newBarber.calendarSettings) }));
      setBarberAccounts((prev) => [...prev, { email: regForm.email.trim(), password: regForm.password, barberId: id }]);
      logAudit({ type: "account_created", actor: newBarber.name, after: { email: regForm.email.trim(), plan: plan.label, city: regForm.city, state: regForm.state } });
      logAudit({ type: "terms_accepted", actor: newBarber.name, after: { termsCount: BARBER_TERMS.length, agreedAll: true } });
      notify(`Welcome to JULOCT, ${regForm.name.split(" ")[0]}! Your ${plan.label} membership is active.`);
      setPayStep("done");
      onLoggedIn(id);
    }, 900);
  }

  return (
    <div className="ap-stack ap-narrow">
      <div className="ap-auth-tabs">
        <button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>Log in</button>
        <button className={mode === "register" ? "active" : ""} onClick={() => setMode("register")}>Register as a barber</button>
      </div>

      {mode === "login" && (
        <div className="ap-stack">
          <h2 className="ap-h2">Barber login</h2>
          <div className="ap-field">
            <label><Mail size={12} /> Email</label>
            <input value={loginForm.email} onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })} placeholder="you@example.com" />
          </div>
          <div className="ap-field">
            <label><Lock size={12} /> Password</label>
            <input type="password" value={loginForm.password} onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })} />
          </div>
          {loginError && <p className="ap-error"><XCircle size={14} /> {loginError}</p>}
          <button className="ap-btn ap-btn-primary ap-btn-lg" onClick={handleLogin}>Log in</button>
          <button className="ap-btn ap-btn-outline" onClick={() => notify("Google sign-in is simulated in this demo.")}>Continue with Google</button>
          <div className="ap-demo-hint">
            <p className="ap-muted-sm">Demo accounts (password: <code>demo1234</code>):</p>
            <p className="ap-mono ap-muted-sm">marcus@example.com · dana@example.com · tommy@example.com · jordan@example.com · maria@example.com · andre@example.com</p>
          </div>
        </div>
      )}

      {mode === "register" && (
        <div className="ap-stack">
          <h2 className="ap-h2">Set up your JULOCT page</h2>
          <div className="ap-form-grid">
            <div className="ap-field"><label>Your name</label><input value={regForm.name} onChange={(e) => setRegForm({ ...regForm, name: e.target.value })} /></div>
            <div className="ap-field"><label>Shop name</label><input value={regForm.shop} onChange={(e) => setRegForm({ ...regForm, shop: e.target.value })} /></div>
            <div className="ap-field ap-field-wide"><label>Shop address</label><input value={regForm.address} onChange={(e) => setRegForm({ ...regForm, address: e.target.value })} placeholder="142 Main St, Birmingham, MI 48009" /></div>
            <div className="ap-field"><label>City</label><input value={regForm.city} onChange={(e) => setRegForm({ ...regForm, city: e.target.value })} /></div>
            <div className="ap-field">
              <label><MapPin size={12} /> State</label>
              <div className="ap-select-wrap">
                <select className="ap-select-fancy" value={regForm.state} onChange={(e) => setRegForm({ ...regForm, state: e.target.value })}>
                  <option value="">Select a state</option>
                  {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <ChevronDown size={15} className="ap-select-chevron" />
              </div>
            </div>
            <div className="ap-field">
              <label><Phone size={12} /> Mobile phone</label>
              <input value={regForm.phone} onChange={(e) => setRegForm({ ...regForm, phone: formatPhoneDigits(e.target.value) })} placeholder="(313) 555-0100" inputMode="numeric" maxLength={14} />
            </div>
            <div className="ap-field">
              <label>Gender</label>
              <div className="ap-segmented">
                <button type="button" className={regForm.gender === "Male" ? "active" : ""} onClick={() => setRegForm({ ...regForm, gender: "Male" })}>Male</button>
                <button type="button" className={regForm.gender === "Female" ? "active" : ""} onClick={() => setRegForm({ ...regForm, gender: "Female" })}>Female</button>
              </div>
            </div>
            <div className="ap-field">
              <label>How did you hear about JULOCT?</label>
              <div className="ap-select-wrap">
                <select className="ap-select-fancy" value={regForm.referralSource} onChange={(e) => setRegForm({ ...regForm, referralSource: e.target.value })}>
                  <option value="">Select one</option>
                  {REFERRAL_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <ChevronDown size={15} className="ap-select-chevron" />
              </div>
            </div>
            <div className="ap-field"><label><Mail size={12} /> Email</label><input value={regForm.email} onChange={(e) => setRegForm({ ...regForm, email: e.target.value })} placeholder="you@example.com" /></div>
            <div className="ap-field"><label><Lock size={12} /> Password</label><input type="password" value={regForm.password} onChange={(e) => setRegForm({ ...regForm, password: e.target.value })} /></div>
            <div className="ap-field"><label><Lock size={12} /> Confirm password</label><input type="password" value={regForm.confirm} onChange={(e) => setRegForm({ ...regForm, confirm: e.target.value })} /></div>
          </div>

          <h4 className="ap-section-label">Choose your membership plan</h4>
          <div className="ap-grid">
            {PLANS.map((p) => (
              <button key={p.id} type="button" className={`ap-plan-card ${selectedPlan === p.id ? "active" : ""}`} onClick={() => setSelectedPlan(p.id)}>
                <span className="ap-plan-label">{p.label}</span>
                <span className="ap-mono ap-price">${p.price}{p.cadence !== "one-time" && <span className="ap-muted-sm">{p.cadence}</span>}</span>
                {p.cadence === "one-time" && <span className="ap-muted-sm">one-time, covers 6 months</span>}
              </button>
            ))}
          </div>

          <h4 className="ap-section-label">Barber terms <span className="ap-muted-sm">({agreedRules.filter(Boolean).length}/{BARBER_TERMS.length} checked)</span></h4>
          <div className="ap-terms-list">
            {BARBER_TERMS.map((term, i) => (
              <label className="ap-checkbox ap-term-row" key={i}>
                <input
                  type="checkbox"
                  checked={agreedRules[i]}
                  onChange={(e) => setAgreedRules((prev) => prev.map((v, idx) => (idx === i ? e.target.checked : v)))}
                />
                <span><span className="ap-mono ap-term-num">{String(i + 1).padStart(2, "0")}</span> {term}</span>
              </label>
            ))}
          </div>

          {regError && <p className="ap-error"><XCircle size={14} /> {regError}</p>}

          <button className="ap-btn ap-btn-primary ap-btn-lg" disabled={payStep === "processing" || !allAgreed} onClick={handleRegister}>
            {payStep === "processing" ? "Processing payment…" : selectedPlan ? <><CreditCard size={16} /> Pay ${PLANS.find((p) => p.id === selectedPlan)?.price || ""} & create my account</> : "Pay & create my account"}
          </button>
        </div>
      )}
    </div>
  );
}

function AdminApp({ barbers, setBarbers, bookings, invites, cancellationFlags, auditLog, logAudit, servicesByBarber, rescheduleRequests }) {
  const [adminTab, setAdminTab] = useState("analytics"); // analytics | management
  const [analyticsSubTab, setAnalyticsSubTab] = useState("geo");
  const [aMode, setAMode] = useState("all"); // all | day | month | year | range
  const [aDay, setADay] = useState("");
  const [aMonth, setAMonth] = useState("");
  const [aYear, setAYear] = useState("");
  const [aFrom, setAFrom] = useState("");
  const [aTo, setATo] = useState("");
  const aFilter = { day: aDay, month: aMonth, year: aYear, from: aFrom, to: aTo };

  function toggleSuspend(id) {
    const b = barbers.find((x) => x.id === id);
    const nextStatus = b.accountStatus === "active" ? "suspended" : "active";
    setBarbers((prev) => prev.map((x) => (x.id === id ? { ...x, accountStatus: nextStatus } : x)));
    logAudit({ type: nextStatus === "suspended" ? "account_suspended" : "account_reactivated", actor: "Admin", before: { accountStatus: b.accountStatus }, after: { accountStatus: nextStatus }, meta: b.name });
  }
  const [logTypeFilter, setLogTypeFilter] = useState("all");
  const [logSearch, setLogSearch] = useState("");

  const logTypes = useMemo(() => ["all", ...Array.from(new Set(auditLog.map((l) => l.type)))], [auditLog]);
  const filteredLog = useMemo(() => {
    return auditLog
      .filter((l) => logTypeFilter === "all" || l.type === logTypeFilter)
      .filter((l) => !logSearch.trim() || (l.actor + " " + l.meta + " " + l.type).toLowerCase().includes(logSearch.trim().toLowerCase()))
      .sort((a, b) => b.at.localeCompare(a.at));
  }, [auditLog, logTypeFilter, logSearch]);

  function fmtChange(v) {
    if (v == null) return "—";
    if (typeof v === "object") return Object.entries(v).map(([k, val]) => `${k}: ${val}`).join(", ");
    return String(v);
  }

  const inviteLeads = useMemo(() => {
    const byPhone = {};
    invites.forEach((inv) => {
      if (!byPhone[inv.phone]) byPhone[inv.phone] = { phone: inv.phone, name: inv.name, state: inv.state, gender: inv.gender, count: 0, firstDate: inv.createdAt };
      byPhone[inv.phone].count += 1;
      byPhone[inv.phone].name = inv.name;
      byPhone[inv.phone].state = inv.state;
      byPhone[inv.phone].gender = inv.gender;
      if (inv.createdAt < byPhone[inv.phone].firstDate) byPhone[inv.phone].firstDate = inv.createdAt;
    });
    return Object.values(byPhone).sort((a, b) => b.count - a.count);
  }, [invites]);

  const cancellationScores = useMemo(() => {
    const byPhone = {};
    cancellationFlags.forEach((cf) => {
      if (!byPhone[cf.phone]) byPhone[cf.phone] = { phone: cf.phone, name: cf.name, points: 0, lastReason: cf.reason, lastDate: cf.createdAt };
      byPhone[cf.phone].points += 1;
      byPhone[cf.phone].name = cf.name;
      if (cf.createdAt > byPhone[cf.phone].lastDate) {
        byPhone[cf.phone].lastDate = cf.createdAt;
        byPhone[cf.phone].lastReason = cf.reason;
      }
    });
    return Object.values(byPhone).sort((a, b) => b.points - a.points);
  }, [cancellationFlags]);

  /* ---------------- Analytics computations (sections 1-10) ---------------- */

  const filteredBookings = useMemo(() => bookings.filter((b) => matchesDateFilter(b.iso, aMode, aFilter)), [bookings, aMode, aDay, aMonth, aYear, aFrom, aTo]);
  const filteredNewBarbers = useMemo(() => barbers.filter((b) => matchesDateFilter((b.createdAt || "").slice(0, 10), aMode, aFilter)), [barbers, aMode, aDay, aMonth, aYear, aFrom, aTo]);

  // 1. Geography
  const byState = useMemo(() => {
    const m = {};
    barbers.forEach((b) => {
      const key = b.state || "Unspecified";
      if (!m[key]) m[key] = { state: key, count: 0, cities: {} };
      m[key].count += 1;
      const city = b.city || "Unspecified";
      m[key].cities[city] = (m[key].cities[city] || 0) + 1;
    });
    return Object.values(m).sort((a, b) => b.count - a.count);
  }, [barbers]);

  // 2. Memberships
  const byPlanType = useMemo(() => {
    const m = {};
    barbers.forEach((b) => {
      const key = (b.subscription?.plan || "Unknown").split(" · ")[0];
      m[key] = (m[key] || 0) + 1;
    });
    return m;
  }, [barbers]);

  // 3. Account status
  const acctActive = barbers.filter((b) => b.accountStatus === "active").length;
  const acctSuspended = barbers.filter((b) => b.accountStatus === "suspended").length;
  const subActive = barbers.filter((b) => b.subscription?.status === "active").length;
  const subGrace = barbers.filter((b) => b.subscription?.status === "grace").length;
  const noCalendarYet = barbers.filter((b) => (servicesByBarber[b.id] || []).length === 0).length;

  // 4. Barber info
  const genderMale = barbers.filter((b) => b.gender === "Male").length;
  const genderFemale = barbers.filter((b) => b.gender === "Female").length;
  const genderUnspecified = barbers.length - genderMale - genderFemale;
  const serviceTypeCounts = useMemo(() => {
    const m = {};
    Object.values(servicesByBarber).forEach((list) => {
      const seen = new Set();
      (list || []).forEach((s) => { if (!seen.has(s.name)) { m[s.name] = (m[s.name] || 0) + 1; seen.add(s.name); } });
    });
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [servicesByBarber]);
  const monthlyNewBarbers = useMemo(() => {
    const m = {};
    barbers.forEach((b) => { const k = monthKey((b.createdAt || "").slice(0, 10)); m[k] = (m[k] || 0) + 1; });
    return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0])).slice(-6);
  }, [barbers]);
  const monthlyActiveBarbers = useMemo(() => {
    const m = {};
    bookings.forEach((b) => { const k = monthKey(b.iso); (m[k] = m[k] || new Set()).add(b.barberId); });
    return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0])).slice(-6).map(([k, v]) => [k, v.size]);
  }, [bookings]);

  // 5. Retention per barber (proxy for satisfaction, since no rating system exists)
  const retentionByBarber = useMemo(() => {
    return barbers.map((b) => {
      const phones = {};
      bookings.filter((x) => x.barberId === b.id).forEach((x) => { phones[x.phone] = (phones[x.phone] || 0) + 1; });
      const total = Object.keys(phones).length;
      const repeat = Object.values(phones).filter((n) => n > 1).length;
      return { name: b.name, total, repeat, rate: total ? Math.round((repeat / total) * 100) : 0 };
    }).sort((a, b) => b.rate - a.rate);
  }, [barbers, bookings]);

  // 6. Bookings report
  const todayIso = isoOf(new Date());
  const bkTotal = filteredBookings.length;
  const bkCompleted = filteredBookings.filter((b) => derivedBookingStatus(b, todayIso) === "Completed").length;
  const bkCancelled = filteredBookings.filter((b) => derivedBookingStatus(b, todayIso) === "Cancelled").length;
  const bkNoShow = filteredBookings.filter((b) => derivedBookingStatus(b, todayIso) === "No Show").length;
  const bkRescheduled = rescheduleRequests.filter((r) => matchesDateFilter(r.requestedAt?.slice(0, 10), aMode, aFilter)).length;
  const avgBookingsPerBarber = barbers.length ? (bookings.length / barbers.length).toFixed(1) : "0";

  // 7. Financial
  const paidRows = filteredBookings.filter((b) => derivedPaymentStatus(b, todayIso) === "Paid");
  const refundedRows = filteredBookings.filter((b) => derivedPaymentStatus(b, todayIso) === "Refunded");
  const heldRows = filteredBookings.filter((b) => derivedPaymentStatus(b, todayIso) === "On Hold");
  const bookingRevenue = paidRows.reduce((s, b) => s + b.price, 0);
  const refundedTotal = refundedRows.reduce((s, b) => s + b.price, 0);
  const heldTotal = heldRows.reduce((s, b) => s + b.price, 0);
  const paidToBarbersTotal = filteredBookings.filter((b) => b.paymentStatus === "paid-to-barber").reduce((s, b) => s + b.price, 0);
  const membershipRevenue = barbers.reduce((s, b) => {
    const planId = PLANS.find((p) => (b.subscription?.plan || "").startsWith(p.label));
    return s + (planId ? planId.price : 0);
  }, 0);
  const barbersWithBookingsInRange = new Set(filteredBookings.map((b) => b.barberId)).size;
  const avgRevenuePerBarber = barbersWithBookingsInRange ? Math.round(bookingRevenue / barbersWithBookingsInRange) : 0;

  // 8. Growth
  const pctActive = barbers.length ? Math.round((acctActive / barbers.length) * 100) : 0;
  const pctCalendarActive = barbers.length ? Math.round(((barbers.length - noCalendarYet) / barbers.length) * 100) : 0;
  const customerFirstSeen = useMemo(() => {
    const m = {};
    bookings.slice().sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || "")).forEach((b) => {
      if (!(b.phone in m)) m[b.phone] = b.createdAt || b.iso;
    });
    return m;
  }, [bookings]);
  const newCustomersInRange = filteredBookings.filter((b) => customerFirstSeen[b.phone] === (b.createdAt || b.iso)).length;
  const returningCustomersInRange = filteredBookings.length - newCustomersInRange;
  const monthlyNewCustomers = useMemo(() => {
    const m = {};
    Object.entries(customerFirstSeen).forEach(([, date]) => { const k = monthKey((date || "").slice(0, 10)); m[k] = (m[k] || 0) + 1; });
    return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0])).slice(-6);
  }, [customerFirstSeen]);

  // 9. Referral sources
  const referralCombined = useMemo(() => {
    const m = {};
    barbers.forEach((b) => { if (b.referralSource) m[b.referralSource] = (m[b.referralSource] || { barbers: 0, customers: 0 }); if (b.referralSource) m[b.referralSource].barbers = (m[b.referralSource].barbers || 0) + 1; });
    const seenPhone = new Set();
    bookings.forEach((b) => {
      if (b.referralSource && !seenPhone.has(b.phone)) {
        seenPhone.add(b.phone);
        if (!m[b.referralSource]) m[b.referralSource] = { barbers: 0, customers: 0 };
        m[b.referralSource].customers = (m[b.referralSource].customers || 0) + 1;
      }
    });
    return Object.entries(m).map(([source, v]) => ({ source, ...v, total: v.barbers + v.customers })).sort((a, b) => b.total - a.total);
  }, [barbers, bookings]);

  // 10. Regional / market
  const byStateActivity = useMemo(() => {
    const m = {};
    barbers.forEach((b) => { const k = b.state || "Unspecified"; if (!m[k]) m[k] = { state: k, barbers: 0, bookings: 0, revenue: 0 }; m[k].barbers += 1; });
    filteredBookings.forEach((bk) => {
      const b = barbers.find((x) => x.id === bk.barberId);
      const k = b?.state || "Unspecified";
      if (!m[k]) m[k] = { state: k, barbers: 0, bookings: 0, revenue: 0 };
      m[k].bookings += 1;
      if (derivedPaymentStatus(bk, todayIso) === "Paid") m[k].revenue += bk.price;
    });
    const totalRevenue = Object.values(m).reduce((s, r) => s + r.revenue, 0) || 1;
    const totalBookings = Object.values(m).reduce((s, r) => s + r.bookings, 0) || 1;
    return Object.values(m).map((r) => ({ ...r, avgPerBarber: r.barbers ? (r.bookings / r.barbers).toFixed(1) : "0", revenueShare: Math.round((r.revenue / totalRevenue) * 100), bookingShare: Math.round((r.bookings / totalBookings) * 100) })).sort((a, b) => b.bookings - a.bookings);
  }, [barbers, filteredBookings]);

  return (
    <div className="ap-stack">
      <div className="ap-admin-head"><Shield size={18} /><h2 className="ap-h2">Platform admin</h2></div>

      <div className="ap-tabbar">
        <button className={`ap-tab ${adminTab === "analytics" ? "active" : ""}`} onClick={() => setAdminTab("analytics")}><TrendingUp size={15} /> Analytics</button>
        <button className={`ap-tab ${adminTab === "management" ? "active" : ""}`} onClick={() => setAdminTab("management")}><ClipboardList size={15} /> Management</button>
      </div>

      {adminTab === "analytics" && (
        <>
          <h4 className="ap-section-label">Filter</h4>
          <div className="ap-report-filters">
            <div className="ap-segmented ap-report-mode">
              {[["all", "All time"], ["day", "Day"], ["month", "Month"], ["year", "Year"], ["range", "Range"]].map(([id, label]) => (
                <button key={id} className={aMode === id ? "active" : ""} onClick={() => setAMode(id)}>{label}</button>
              ))}
            </div>
            {aMode === "day" && <input type="date" value={aDay} onChange={(e) => setADay(e.target.value)} />}
            {aMode === "month" && <input type="month" value={aMonth} onChange={(e) => setAMonth(e.target.value)} />}
            {aMode === "year" && (
              <div className="ap-select-wrap" style={{ maxWidth: 140 }}>
                <select className="ap-select-fancy" value={aYear} onChange={(e) => setAYear(e.target.value)}>
                  <option value="">Select year</option>
                  {[0, 1, 2].map((i) => { const y = new Date().getFullYear() - i; return <option key={y} value={String(y)}>{y}</option>; })}
                </select>
                <ChevronDown size={15} className="ap-select-chevron" />
              </div>
            )}
            {aMode === "range" && (
              <div className="ap-report-range">
                <div className="ap-field"><label>From</label><input type="date" value={aFrom} onChange={(e) => setAFrom(e.target.value)} /></div>
                <div className="ap-field"><label>To</label><input type="date" value={aTo} onChange={(e) => setATo(e.target.value)} /></div>
              </div>
            )}
          </div>
          <p className="ap-muted-sm">Range filter applies to booking- and payment-based metrics below. Snapshot metrics (geography, account status, gender) always reflect the current moment.</p>

          <div className="ap-tabbar ap-subtabbar">
            {[
              ["geo", "1 · Geography"], ["memberships", "2 · Memberships"], ["accounts", "3 · Accounts"],
              ["barbers", "4 · Barber info"], ["retention", "5 · Retention"], ["bookings", "6 · Bookings"],
              ["financial", "7 · Financial"], ["growth", "8 · Growth"], ["referral", "9 · Referral"], ["regional", "10 · Regional"],
            ].map(([id, label]) => (
              <button key={id} className={`ap-tab ${analyticsSubTab === id ? "active" : ""}`} onClick={() => setAnalyticsSubTab(id)}>{label}</button>
            ))}
          </div>

          {/* 1. Geography */}
          {analyticsSubTab === "geo" && (<>
          <h4 className="ap-section-label">1 · Barber geography</h4>
          <div className="ap-admin-table">
            <div className="ap-admin-row ap-geo-head-row"><span>State</span><span>Barbers</span><span>Cities</span></div>
            {byState.map((s) => (
              <div className="ap-admin-row ap-geo-row" key={s.state}>
                <span>{s.state}</span>
                <span><Pill tone="brass">{s.count}</Pill></span>
                <span className="ap-muted-sm">{Object.entries(s.cities).map(([c, n]) => `${c} (${n})`).join(", ")}</span>
              </div>
            ))}
          </div>
          <p className="ap-muted-sm">New states/cities appear here automatically as barbers register — nothing to configure.</p>
          </>)}

          {/* 2. Memberships */}
          {analyticsSubTab === "memberships" && (<>
          <h4 className="ap-section-label">2 · Memberships</h4>
          <div className="ap-stat-row">
            {PLANS.map((p) => (
              <Ticket className="ap-stat" key={p.id}><span className="ap-muted-sm">{p.label} plan</span><span className="ap-mono ap-price">{byPlanType[p.label] || 0}</span></Ticket>
            ))}
            <Ticket className="ap-stat"><span className="ap-muted-sm">New in range</span><span className="ap-mono ap-price">{filteredNewBarbers.length}</span></Ticket>
          </div>
          <p className="ap-muted-sm">ℹ️ Renewals, expirations, renewal rate, and average membership lifespan aren't trackable yet — there's no billing-cycle/renewal engine built (subscriptions don't actually recur or expire in this prototype).</p>
          </>)}

          {/* 3. Account status */}
          {analyticsSubTab === "accounts" && (<>
          <h4 className="ap-section-label">3 · Account status</h4>
          <div className="ap-stat-row">
            <Ticket className="ap-stat"><span className="ap-muted-sm">Active accounts</span><span className="ap-mono ap-price">{acctActive}</span></Ticket>
            <Ticket className="ap-stat"><span className="ap-muted-sm">Suspended</span><span className="ap-mono ap-price">{acctSuspended}</span></Ticket>
            <Ticket className="ap-stat"><span className="ap-muted-sm">Sub. active</span><span className="ap-mono ap-price">{subActive}</span></Ticket>
            <Ticket className="ap-stat"><span className="ap-muted-sm">Sub. grace period</span><span className="ap-mono ap-price">{subGrace}</span></Ticket>
            <Ticket className="ap-stat"><span className="ap-muted-sm">Registered, no services yet</span><span className="ap-mono ap-price">{noCalendarYet}</span></Ticket>
          </div>
          </>)}

          {/* 4. Barber info */}
          {analyticsSubTab === "barbers" && (<>
          <h4 className="ap-section-label">4 · Barber info</h4>
          <div className="ap-stat-row">
            <Ticket className="ap-stat"><span className="ap-muted-sm">Female</span><span className="ap-mono ap-price">{genderFemale}</span></Ticket>
            <Ticket className="ap-stat"><span className="ap-muted-sm">Male</span><span className="ap-mono ap-price">{genderMale}</span></Ticket>
            <Ticket className="ap-stat"><span className="ap-muted-sm">Unspecified</span><span className="ap-mono ap-price">{genderUnspecified}</span></Ticket>
          </div>
          <div className="ap-admin-table">
            <div className="ap-admin-row ap-geo-head-row"><span>Service type</span><span>Barbers offering it</span><span /></div>
            {serviceTypeCounts.map(([name, count]) => (
              <div className="ap-admin-row ap-geo-row" key={name}><span>{name}</span><span><Pill tone="slate">{count}</Pill></span><span /></div>
            ))}
          </div>
          <div className="ap-trend-row">
            <div>
              <p className="ap-muted-sm">New barbers / month</p>
              <div className="ap-trend-mini">{monthlyNewBarbers.map(([k, v]) => <span key={k}><span className="ap-mono">{v}</span><span className="ap-muted-sm">{k}</span></span>)}</div>
            </div>
            <div>
              <p className="ap-muted-sm">Active barbers / month (≥1 booking)</p>
              <div className="ap-trend-mini">{monthlyActiveBarbers.map(([k, v]) => <span key={k}><span className="ap-mono">{v}</span><span className="ap-muted-sm">{k}</span></span>)}</div>
            </div>
          </div>
          </>)}

          {/* 5. Satisfaction / retention */}
          {analyticsSubTab === "retention" && (<>
          <h4 className="ap-section-label">5 · Satisfaction &amp; retention</h4>
          <p className="ap-muted-sm">ℹ️ Ratings, reviews, and complaint counts aren't tracked — no review/complaint system exists yet (this was explicitly out of scope for MVP v1). What we <em>can</em> measure honestly is repeat-booking rate per barber:</p>
          <div className="ap-admin-table">
            <div className="ap-admin-row ap-geo-head-row"><span>Barber</span><span>Unique customers</span><span>Repeat-booking rate</span></div>
            {retentionByBarber.map((r) => (
              <div className="ap-admin-row ap-geo-row" key={r.name}><span>{r.name}</span><span className="ap-mono">{r.total}</span><span><Pill tone={r.rate >= 30 ? "sage" : "slate"}>{r.rate}%</Pill></span></div>
            ))}
          </div>
          </>)}

          {/* 6. Bookings */}
          {analyticsSubTab === "bookings" && (<>
          <h4 className="ap-section-label">6 · Bookings</h4>
          <div className="ap-stat-row">
            <Ticket className="ap-stat"><span className="ap-muted-sm">Total</span><span className="ap-mono ap-price">{bkTotal}</span></Ticket>
            <Ticket className="ap-stat"><span className="ap-muted-sm">Completed</span><span className="ap-mono ap-price">{bkCompleted}</span></Ticket>
            <Ticket className="ap-stat"><span className="ap-muted-sm">Cancelled</span><span className="ap-mono ap-price">{bkCancelled}</span></Ticket>
            <Ticket className="ap-stat"><span className="ap-muted-sm">No-show</span><span className="ap-mono ap-price">{bkNoShow}</span></Ticket>
            <Ticket className="ap-stat"><span className="ap-muted-sm">Reschedules requested</span><span className="ap-mono ap-price">{bkRescheduled}</span></Ticket>
            <Ticket className="ap-stat"><span className="ap-muted-sm">Avg / barber (all-time)</span><span className="ap-mono ap-price">{avgBookingsPerBarber}</span></Ticket>
          </div>
          </>)}

          {/* 7. Financial */}
          {analyticsSubTab === "financial" && (<>
          <h4 className="ap-section-label">7 · Financial</h4>
          <div className="ap-stat-row">
            <Ticket className="ap-stat"><span className="ap-muted-sm">Booking revenue (paid)</span><span className="ap-mono ap-price">${bookingRevenue}</span></Ticket>
            <Ticket className="ap-stat"><span className="ap-muted-sm">Membership revenue (current)</span><span className="ap-mono ap-price">${membershipRevenue}</span></Ticket>
            <Ticket className="ap-stat"><span className="ap-muted-sm">Successful payments</span><span className="ap-mono ap-price">{paidRows.length}</span></Ticket>
            <Ticket className="ap-stat"><span className="ap-muted-sm">Refunds</span><span className="ap-mono ap-price">{refundedRows.length} · ${refundedTotal}</span></Ticket>
            <Ticket className="ap-stat"><span className="ap-muted-sm">On hold</span><span className="ap-mono ap-price">${heldTotal}</span></Ticket>
            <Ticket className="ap-stat"><span className="ap-muted-sm">Paid to barbers (no-show)</span><span className="ap-mono ap-price">${paidToBarbersTotal}</span></Ticket>
            <Ticket className="ap-stat"><span className="ap-muted-sm">Avg revenue / active barber</span><span className="ap-mono ap-price">${avgRevenuePerBarber}</span></Ticket>
          </div>
          </>)}

          {/* 8. Growth */}
          {analyticsSubTab === "growth" && (<>
          <h4 className="ap-section-label">8 · System growth</h4>
          <div className="ap-stat-row">
            <Ticket className="ap-stat"><span className="ap-muted-sm">Registration → active</span><span className="ap-mono ap-price">{pctActive}%</span></Ticket>
            <Ticket className="ap-stat"><span className="ap-muted-sm">Registration → services added</span><span className="ap-mono ap-price">{pctCalendarActive}%</span></Ticket>
            <Ticket className="ap-stat"><span className="ap-muted-sm">New customers (in range)</span><span className="ap-mono ap-price">{newCustomersInRange}</span></Ticket>
            <Ticket className="ap-stat"><span className="ap-muted-sm">Returning customers (in range)</span><span className="ap-mono ap-price">{returningCustomersInRange}</span></Ticket>
          </div>
          <div className="ap-trend-row">
            <div>
              <p className="ap-muted-sm">New customers / month</p>
              <div className="ap-trend-mini">{monthlyNewCustomers.map(([k, v]) => <span key={k}><span className="ap-mono">{v}</span><span className="ap-muted-sm">{k}</span></span>)}</div>
            </div>
          </div>
          <p className="ap-muted-sm">ℹ️ True barber retention (still active N months after joining) needs a longer time series than this demo has — the calculation is ready, there's just not enough history yet.</p>
          </>)}

          {/* 9. Referral sources */}
          {analyticsSubTab === "referral" && (<>
          <h4 className="ap-section-label">9 · How people found JULOCT</h4>
          <div className="ap-admin-table">
            <div className="ap-admin-row ap-geo-head-row"><span>Channel</span><span>Barbers</span><span>Customers</span></div>
            {referralCombined.length === 0 && <p className="ap-muted-sm">No referral-source data collected yet.</p>}
            {referralCombined.map((r) => (
              <div className="ap-admin-row ap-geo-row" key={r.source}>
                <span>{r.source} {referralCombined[0]?.source === r.source && <Pill tone="brass">Top channel</Pill>}</span>
                <span className="ap-mono">{r.barbers}</span>
                <span className="ap-mono">{r.customers}</span>
              </div>
            ))}
          </div>
          <p className="ap-muted-sm">Customers are counted once per phone number (first answer kept), not once per booking.</p>
          </>)}

          {/* 10. Regional / market */}
          {analyticsSubTab === "regional" && (<>
          <h4 className="ap-section-label">10 · Regional performance</h4>
          <div className="ap-admin-table">
            <div className="ap-admin-row ap-region-head-row"><span>State</span><span>Barbers</span><span>Bookings</span><span>Revenue</span><span>Avg/barber</span><span>Share</span></div>
            {byStateActivity.map((r, i) => (
              <div className="ap-admin-row ap-region-row" key={r.state}>
                <span>{r.state} {i === 0 && <Pill tone="sage">Most active</Pill>} {i === byStateActivity.length - 1 && byStateActivity.length > 1 && <Pill tone="crimson">Least active</Pill>}</span>
                <span className="ap-mono">{r.barbers}</span>
                <span className="ap-mono">{r.bookings}</span>
                <span className="ap-mono">${r.revenue}</span>
                <span className="ap-mono">{r.avgPerBarber}</span>
                <span className="ap-mono">{r.bookingShare}% bookings · {r.revenueShare}% revenue</span>
              </div>
            ))}
          </div>
          <p className="ap-muted-sm">"Least active" is a candidate for more local advertising spend; period-over-period growth-rate comparison can be added once we have more than one reporting period of history.</p>
          </>)}
        </>
      )}

      {adminTab === "management" && (
        <>
      <div className="ap-stat-row">
        <Ticket className="ap-stat"><span className="ap-muted-sm">Barbers</span><span className="ap-mono ap-price">{barbers.length}</span></Ticket>
        <Ticket className="ap-stat"><span className="ap-muted-sm">Total bookings</span><span className="ap-mono ap-price">{bookings.length}</span></Ticket>
        <Ticket className="ap-stat"><span className="ap-muted-sm">Active subs</span><span className="ap-mono ap-price">{barbers.filter((b) => b.subscription.status === "active").length}</span></Ticket>
      </div>
      <h4 className="ap-section-label">Barbers</h4>
      <div className="ap-admin-table">
        <div className="ap-admin-row ap-admin-head-row">
          <span>Name</span><span>Plan</span><span>Sub. status</span><span>Account</span><span />
        </div>
        {barbers.map((b) => (
          <div className="ap-admin-row" key={b.id}>
            <span>{b.name} <span className="ap-muted-sm">· {b.shop}</span></span>
            <span className="ap-mono ap-muted-sm">{b.subscription.plan}</span>
            <span><Pill tone={b.subscription.status === "active" ? "sage" : "crimson"}>{b.subscription.status}</Pill></span>
            <span><Pill tone={b.accountStatus === "active" ? "sage" : "crimson"}>{b.accountStatus}</Pill></span>
            <button className="ap-btn ap-btn-tiny ap-btn-outline" onClick={() => toggleSuspend(b.id)}>
              {b.accountStatus === "active" ? "Suspend" : "Reactivate"}
            </button>
          </div>
        ))}
      </div>

      <h4 className="ap-section-label">Barber invite leads ({inviteLeads.length})</h4>
      <p className="ap-muted-sm">Barbers customers have asked to invite — useful for outbound sales and marketing follow-up.</p>
      <div className="ap-admin-table">
        <div className="ap-admin-row ap-admin-invite-head-row">
          <span>Barber name</span><span>Phone</span><span>Gender</span><span>Times invited</span><span>State</span><span>First invited</span>
        </div>
        {inviteLeads.length === 0 && <p className="ap-muted-sm">No invites submitted yet.</p>}
        {inviteLeads.map((lead) => (
          <div className="ap-admin-row ap-admin-invite-row" key={lead.phone}>
            <span>{lead.name}</span>
            <span className="ap-mono ap-muted-sm">{lead.phone}</span>
            <span className="ap-muted-sm">{lead.gender}</span>
            <span><Pill tone={lead.count > 1 ? "brass" : "slate"}>{lead.count}×</Pill></span>
            <span className="ap-mono ap-muted-sm">{lead.state}</span>
            <span className="ap-mono ap-muted-sm">{new Date(lead.firstDate).toLocaleDateString()}</span>
          </div>
        ))}
      </div>

      <h4 className="ap-section-label">Audit log ({filteredLog.length})</h4>
      <p className="ap-muted-sm">Every meaningful change in JULOCT — who did what, and when — for dispute resolution and support.</p>
      <div className="ap-report-filters">
        <div className="ap-select-wrap" style={{ maxWidth: 220 }}>
          <select className="ap-select-fancy" value={logTypeFilter} onChange={(e) => setLogTypeFilter(e.target.value)}>
            {logTypes.map((t) => <option key={t} value={t}>{t === "all" ? "All change types" : t.replace(/_/g, " ")}</option>)}
          </select>
          <ChevronDown size={15} className="ap-select-chevron" />
        </div>
        <input className="ap-log-search" placeholder="Search by actor, type, or detail…" value={logSearch} onChange={(e) => setLogSearch(e.target.value)} />
      </div>
      <div className="ap-audit-table">
        <div className="ap-audit-row ap-audit-head-row">
          <span>Type</span><span>Date &amp; time</span><span>Actor</span><span>Before</span><span>After</span><span>Detail</span>
        </div>
        {filteredLog.length === 0 && <p className="ap-muted-sm">No matching log entries.</p>}
        {filteredLog.map((l) => (
          <div className="ap-audit-row" key={l.id}>
            <span><Pill tone="slate">{l.type.replace(/_/g, " ")}</Pill></span>
            <span className="ap-mono ap-muted-sm">{new Date(l.at).toLocaleString()}</span>
            <span>{l.actor}</span>
            <span className="ap-muted-sm">{fmtChange(l.before)}</span>
            <span className="ap-muted-sm">{fmtChange(l.after)}</span>
            <span className="ap-muted-sm">{l.meta || "—"}</span>
          </div>
        ))}
      </div>

      <h4 className="ap-section-label">Customer cancellation flags ({cancellationScores.length})</h4>
      <p className="ap-muted-sm">Each 24h+ cancellation logs a point against the customer's phone number, so repeated last-minute pattern changes are easy to spot.</p>
      <div className="ap-admin-table">
        <div className="ap-admin-row ap-admin-cancel-head-row">
          <span>Customer name</span><span>Phone</span><span>Points</span><span>Last reason</span><span>Last cancelled</span>
        </div>
        {cancellationScores.length === 0 && <p className="ap-muted-sm">No cancellations logged yet.</p>}
        {cancellationScores.map((c) => (
          <div className="ap-admin-row ap-admin-cancel-row" key={c.phone}>
            <span>{c.name}</span>
            <span className="ap-mono ap-muted-sm">{c.phone}</span>
            <span><Pill tone={c.points > 1 ? "crimson" : "slate"}>{c.points}</Pill></span>
            <span className="ap-muted-sm">{c.lastReason || "—"}</span>
            <span className="ap-mono ap-muted-sm">{new Date(c.lastDate).toLocaleDateString()}</span>
          </div>
        ))}
      </div>

      <h4 className="ap-section-label">All bookings (troubleshooting view)</h4>
      <div className="ap-list">
        {bookings.slice(-8).reverse().map((b) => (
          <div className="ap-list-row" key={b.id}>
            <span>{b.customerName} → {barbers.find((x) => x.id === b.barberId)?.name}</span>
            <span className="ap-mono ap-muted-sm">{b.iso} {fmtTime(b.hour)} · {b.status}</span>
          </div>
        ))}
      </div>
        </>
      )}
    </div>
  );
}

/* ============================== ROOT APP ============================== */

export default function App() {
  const [barbers, setBarbers] = useState(INITIAL_BARBERS);
  const [servicesByBarber, setServicesByBarber] = useState(INITIAL_SERVICES);
  const [photosByBarber, setPhotosByBarber] = useState(INITIAL_PHOTOS);
  const [initial] = useState(() => {
    const map = {};
    INITIAL_BARBERS.forEach((b) => { map[b.id] = buildCalendar(b.calendarSeed, planDays(b), b.calendarSettings); });
    const bk = seedBookings(INITIAL_BARBERS, map); // mutates map to link bookingIds
    return { calendarByBarber: map, bookings: bk };
  });
  const [calendarByBarber, setCalendarByBarber] = useState(initial.calendarByBarber);
  const [bookings, setBookings] = useState(initial.bookings);
  const [invites, setInvites] = useState([]);
  const [cancellationFlags, setCancellationFlags] = useState([]);
  const [rescheduleRequests, setRescheduleRequests] = useState([]);
  const [barberAccounts, setBarberAccounts] = useState([
    { email: "marcus@example.com", password: "demo1234", barberId: "b1" },
    { email: "dana@example.com", password: "demo1234", barberId: "b2" },
    { email: "tommy@example.com", password: "demo1234", barberId: "b3" },
    { email: "jordan@example.com", password: "demo1234", barberId: "b4" },
    { email: "maria@example.com", password: "demo1234", barberId: "b5" },
    { email: "andre@example.com", password: "demo1234", barberId: "b6" },
  ]);
  const [loggedInBarberId, setLoggedInBarberId] = useState(null);
  const [role, setRole] = useState("customer");
  const [toast, setToast] = useState("");
  const [auditLog, setAuditLog] = useState([]);

  function notify(msg) {
    setToast(msg);
    setTimeout(() => setToast(""), 4000);
  }

  function logAudit({ type, actor, before, after, meta, phone, barberId }) {
    setAuditLog((prev) => [...prev, {
      id: "al-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
      type, actor: actor || "System", before: before ?? null, after: after ?? null, meta: meta || "",
      phone: phone || null, barberId: barberId || null,
      at: new Date().toISOString(),
    }]);
  }

  const STAFF_ROLES = [
    { id: "barber", label: "Barber login", icon: Scissors },
  ];

  return (
    <div className="ap-app">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');

        .ap-app {
          --ink:#171A21; --ink-soft:#2B303B;
          --paper:#F7F4EE; --paper-dim:#EFEAE0;
          --brass:#A9812F; --brass-soft:#EADFC0;
          --crimson:#A63A2E; --crimson-soft:#F3DED9;
          --sage:#4C7A5E; --sage-soft:#DEEAE2;
          --slate:#7A7267; --line:#DED7C8;
          background:var(--paper); color:var(--ink);
          font-family:'Inter',sans-serif; border-radius:14px; overflow:hidden;
          border:1px solid var(--line);
        }
        .ap-app * { box-sizing:border-box; }
        .ap-app h1,.ap-app h2,.ap-app h3 { font-family:'Fraunces',serif; margin:0; letter-spacing:-0.01em; }
        .ap-app button { font-family:inherit; cursor:pointer; }
        .ap-app input, .ap-app select, .ap-app textarea { font-family:inherit; }

        .ap-topbar { background:var(--ink); color:var(--paper); padding:14px 20px; display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap; }
        .ap-brand { display:flex; align-items:center; gap:8px; font-family:'Fraunces',serif; font-size:19px; font-weight:600; }
        .ap-brand .mark { width:28px; height:28px; border-radius:50%; background:var(--brass); display:flex; align-items:center; justify-content:center; color:var(--ink); }
        .ap-staff-links { display:flex; gap:16px; }
        .ap-staff-link { background:none; border:none; color:rgba(247,244,238,0.6); font-size:12px; display:flex; align-items:center; gap:5px; padding:4px 2px; border-bottom:1px solid transparent; }
        .ap-staff-link:hover { color:var(--paper); border-bottom-color:var(--brass); }
        .ap-back-to-site { background:none; border:none; color:var(--paper); font-size:13px; display:flex; align-items:center; gap:5px; opacity:.85; }
        .ap-back-to-site:hover { opacity:1; }
        .ap-demo-switcher { display:flex; align-items:center; gap:10px; font-size:12px; color:var(--slate); border-top:1px dashed var(--line); padding-top:14px; margin-top:6px; }
        .ap-demo-switcher .ap-staff-link { color:var(--brass); }
        .ap-demo-switcher .ap-staff-link:hover { color:var(--ink); border-bottom-color:var(--brass); }

        .ap-demo-banner { background:var(--brass-soft); color:#5C4415; font-size:12px; padding:6px 20px; text-align:center; font-family:'IBM Plex Mono',monospace; }

        .ap-body { padding:24px; max-height:640px; overflow-y:auto; }
        .ap-container { max-width:900px; margin:0 auto; width:100%; }
        .ap-stack { display:flex; flex-direction:column; gap:16px; }
        .ap-narrow { max-width:420px; margin:0 auto; }

        .ap-eyebrow { font-family:'IBM Plex Mono',monospace; font-size:11px; text-transform:uppercase; letter-spacing:0.08em; color:var(--brass); margin:0 0 6px; }
        .ap-h1 { font-size:34px; line-height:1.08; font-weight:600; }
        .ap-h2 { font-size:22px; font-weight:600; }
        .ap-hero { padding:20px 0 8px; text-align:center; display:flex; flex-direction:column; align-items:center; }
        .ap-search-row { margin:18px auto 0; display:flex; align-items:center; gap:10px; background:#fff; border:1px solid var(--line); border-radius:10px; padding:11px 14px; width:100%; max-width:520px; }
        .ap-search-row input { border:none; outline:none; flex:1; font-size:14.5px; background:transparent; }
        .ap-search-row svg { color:var(--slate); flex:none; }

        .ap-section-label { font-family:'IBM Plex Mono',monospace; font-size:11px; text-transform:uppercase; letter-spacing:0.07em; color:var(--slate); margin:6px 0 -6px; }

        .ap-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(230px,1fr)); gap:14px; }
        .ap-grid-profiles { grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); }
        .ap-results-count { margin-top:-6px; }
        .ap-show-more { align-self:center; }

        .ap-ticket { position:relative; background:#fff; border:1px solid var(--line); border-radius:12px; padding:16px 18px; display:flex; align-items:center; justify-content:space-between; gap:12px; }
        .ap-notch { position:absolute; width:14px; height:14px; background:var(--paper); border:1px solid var(--line); border-radius:50%; top:50%; transform:translateY(-50%); }
        .ap-notch-l { left:-8px; } .ap-notch-r { right:-8px; }

        /* barber profile card — vertical, room for a real photo, button pinned to the bottom */
        .ap-profile-card { display:flex; flex-direction:column; background:#fff; border:1px solid var(--line); border-radius:14px; overflow:hidden; }
        .ap-profile-card-body { padding:14px 16px 4px; flex:1; }
        .ap-profile-card-body h3 { font-size:16.5px; white-space:nowrap; }
        .ap-location { display:flex; align-items:center; gap:4px; margin-top:4px; }
        .ap-profile-card-btn { margin:12px 16px 16px; align-self:stretch; justify-content:center; }

        .ap-photo { display:flex; align-items:center; justify-content:center; color:rgba(247,244,238,0.55); flex:none; }
        .ap-photo-card { width:100%; aspect-ratio:16/10; }
        .ap-photo-header { width:112px; height:96px; border-radius:12px; }

        .ap-carousel { position:relative; overflow:hidden; }
        .ap-carousel-label { position:absolute; left:10px; bottom:8px; font-size:11px; color:rgba(247,244,238,0.85); font-family:'IBM Plex Mono',monospace; }
        .ap-carousel-nav { position:absolute; top:50%; transform:translateY(-50%); background:rgba(23,26,33,0.35); border:none; color:#fff; width:24px; height:24px; border-radius:50%; display:flex; align-items:center; justify-content:center; opacity:0; transition:.15s; }
        .ap-carousel:hover .ap-carousel-nav { opacity:1; }
        .ap-carousel-prev { left:8px; } .ap-carousel-next { right:8px; }
        .ap-carousel-dots { position:absolute; right:10px; bottom:9px; display:flex; gap:4px; }
        .ap-carousel-dots span { width:5px; height:5px; border-radius:50%; background:rgba(247,244,238,0.4); }
        .ap-carousel-dots span.active { background:var(--brass-soft); }

        .ap-photo-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr)); gap:12px; }
        .ap-photo-manage-card { background:#fff; border:1px solid var(--line); border-radius:10px; padding:10px; display:flex; flex-direction:column; gap:8px; }
        .ap-photo-thumb { width:100%; aspect-ratio:16/10; border-radius:8px; }
        .ap-photo-manage-card input { border:1px solid var(--line); border-radius:7px; padding:6px 9px; font-size:12.5px; }
        .ap-photo-add { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px; aspect-ratio:16/10; border:1px dashed var(--line); border-radius:10px; color:var(--slate); background:var(--paper-dim); font-size:12.5px; }
        .ap-photo-add:hover { border-color:var(--brass); color:var(--brass); }

        .ap-avatar { width:42px; height:42px; border-radius:50%; background:var(--ink); color:var(--brass-soft); display:flex; align-items:center; justify-content:center; font-family:'Fraunces',serif; font-weight:600; font-size:14px; flex:none; }
        .ap-avatar-lg { width:64px; height:64px; font-size:20px; }
        .ap-barber-info { flex:1; }
        .ap-barber-info h3 { font-size:15.5px; }
        .ap-muted { color:var(--slate); font-size:13px; margin:2px 0; }
        .ap-muted-sm { color:var(--slate); font-size:11.5px; }
        .ap-mono { font-family:'IBM Plex Mono',monospace; }
        .ap-price { font-weight:600; font-size:15px; }
        .ap-price-sm { font-size:14px; color:var(--brass); margin-left:8px; }

        .ap-invite-cta { margin-top:16px; padding-top:14px; border-top:1px dashed var(--line); display:flex; flex-direction:column; gap:8px; align-items:flex-start; }

        .ap-modal-overlay { position:fixed; inset:0; background:rgba(23,26,33,0.55); display:flex; align-items:center; justify-content:center; z-index:60; padding:20px; }
        .ap-modal { background:#fff; border-radius:14px; padding:22px; width:100%; max-width:380px; display:flex; flex-direction:column; gap:12px; box-shadow:0 20px 60px rgba(0,0,0,.3); }
        .ap-modal-head { display:flex; align-items:center; justify-content:space-between; }
        .ap-modal-head h3 { font-size:18px; }
        .ap-invite-success { display:flex; flex-direction:column; align-items:center; gap:8px; padding:16px 0; color:var(--sage); text-align:center; }

        .ap-btn { border-radius:20px; padding:9px 16px; font-size:13px; font-weight:600; border:1px solid transparent; display:inline-flex; align-items:center; gap:6px; white-space:nowrap; transition:.15s; }
        .ap-btn-primary { background:var(--ink); color:var(--paper); }
        .ap-btn-primary:hover { background:var(--ink-soft); }
        .ap-btn-primary:disabled { opacity:.4; cursor:not-allowed; }
        .ap-btn-outline { background:transparent; border-color:var(--ink); color:var(--ink); }
        .ap-btn-outline:hover { background:var(--ink); color:var(--paper); }
        .ap-btn-ghost { background:transparent; color:var(--crimson); }
        .ap-btn-lg { padding:12px 22px; font-size:14px; }
        .ap-btn-tiny { padding:5px 10px; font-size:11.5px; border-radius:14px; }

        .ap-back { align-self:flex-start; background:none; border:none; color:var(--slate); font-size:13px; display:flex; align-items:center; gap:4px; padding:0; }
        .ap-back:hover { color:var(--ink); }

        .ap-profile-head { display:flex; gap:16px; align-items:flex-start; }

        .ap-service-card { flex-direction:row; }
        .ap-service-right { display:flex; align-items:center; gap:10px; }

        .ap-day-strip { display:flex; gap:8px; overflow-x:auto; padding-bottom:4px; }
        .ap-day-chip { flex:none; background:#fff; border:1px solid var(--line); border-radius:10px; padding:9px 12px; display:flex; flex-direction:column; gap:4px; align-items:flex-start; font-size:12px; min-width:88px; }
        .ap-day-chip.active { border-color:var(--ink); background:var(--ink); color:var(--paper); }
        .ap-day-chip.disabled { opacity:.45; }

        .ap-slot-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(96px,1fr)); gap:8px; }
        .ap-slot { background:#fff; border:1px solid var(--line); border-radius:8px; padding:9px 4px; font-size:12.5px; font-family:'IBM Plex Mono',monospace; }
        .ap-slot.active { background:var(--brass); border-color:var(--brass); color:#fff; font-weight:600; }
        .ap-slot.taken { opacity:.35; text-decoration:line-through; }
        .ap-slot-card { background:#fff; border:1px solid var(--line); border-radius:8px; padding:9px 8px; display:flex; flex-direction:column; gap:3px; font-size:12px; }
        .ap-slot-card.booked { border-color:var(--crimson-soft); background:var(--crimson-soft); }
        .ap-slot-card.blocked { background:var(--paper-dim); border-style:dashed; opacity:.8; }
        .ap-slot-block-btn { margin-top:4px; background:none; border:none; padding:0; color:var(--crimson); font-size:10.5px; text-align:left; text-decoration:underline; }
        .ap-slot-card.blocked .ap-slot-block-btn { color:var(--sage); }

        .ap-checkbox { display:flex; align-items:center; gap:8px; font-size:13px; }
        .ap-terms-list { display:flex; flex-direction:column; gap:2px; background:#fff; border:1px solid var(--line); border-radius:10px; padding:6px 4px; max-height:280px; overflow-y:auto; }
        .ap-term-row { align-items:flex-start; padding:8px 10px; border-radius:8px; }
        .ap-term-row:hover { background:var(--paper-dim); }
        .ap-term-row input { margin-top:2px; flex:none; }
        .ap-term-num { color:var(--brass); margin-right:6px; font-size:11px; }

        .ap-auth-tabs { display:flex; border-bottom:1px solid var(--line); gap:4px; }
        .ap-auth-tabs button { background:none; border:none; padding:10px 4px; margin-right:18px; font-size:14px; color:var(--slate); border-bottom:2px solid transparent; }
        .ap-auth-tabs button.active { color:var(--ink); font-weight:600; border-bottom-color:var(--brass); }

        .ap-demo-hint { background:var(--paper-dim); border:1px dashed var(--line); border-radius:10px; padding:10px 14px; }
        .ap-demo-hint code { background:#fff; border:1px solid var(--line); border-radius:4px; padding:1px 5px; font-family:'IBM Plex Mono',monospace; }

        .ap-plan-card { display:flex; flex-direction:column; gap:4px; background:#fff; border:1px solid var(--line); border-radius:12px; padding:16px; text-align:left; }
        .ap-plan-card.active { border-color:var(--brass); background:var(--brass-soft); }
        .ap-plan-label { font-family:'Fraunces',serif; font-weight:600; font-size:15px; }
        .ap-policy-box { background:var(--paper-dim); border:1px solid var(--line); border-radius:10px; padding:14px 16px; display:flex; flex-direction:column; gap:8px; }
        .ap-calrules-box { background:var(--paper-dim); border:1px solid var(--line); border-radius:10px; padding:16px 18px; display:flex; flex-direction:column; gap:10px; }
        .ap-break-row { display:flex; align-items:center; gap:12px; background:#fff; border:1px solid var(--line); border-radius:8px; padding:7px 12px; font-size:13px; }
        .ap-break-row span:first-child { flex:1; }
        .ap-break-add-row { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
        .ap-weekday-picker { max-width:420px; }
        .ap-weekday-picker button { padding:8px 0; font-size:12.5px; }
        .ap-holiday-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:4px; }
        .ap-holiday-row { background:#fff; border:1px solid var(--line); border-radius:8px; padding:8px 12px; }
        .ap-month-nav { display:flex; align-items:center; gap:14px; }
        .ap-month-nav span { font-size:15px; font-weight:600; min-width:160px; text-align:center; }
        .ap-month-nav button:disabled { opacity:.3; }
        .ap-policy-box-title { font-family:'IBM Plex Mono',monospace; font-size:11px; text-transform:uppercase; letter-spacing:0.06em; color:var(--slate); }
        .ap-policy-box ol { margin:0; padding-left:18px; font-size:13px; display:flex; flex-direction:column; gap:4px; }
        .ap-extra-block { display:flex; flex-direction:column; gap:14px; padding:14px 16px; background:var(--paper-dim); border:1px dashed var(--line); border-radius:12px; }
        .ap-extra-service { display:flex; justify-content:space-between; align-items:center; background:#fff; border:1px solid var(--line); border-radius:10px; padding:10px 14px; font-size:13px; text-align:left; }
        .ap-extra-service.active { border-color:var(--brass); background:var(--brass-soft); font-weight:600; }

        .ap-form-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
        .ap-field { display:flex; flex-direction:column; gap:5px; }
        .ap-field-wide { grid-column:1 / -1; }
        .ap-field label { font-size:11.5px; color:var(--slate); display:flex; align-items:center; gap:4px; }
        .ap-field input, .ap-field textarea { border:1px solid var(--line); border-radius:8px; padding:9px 11px; font-size:13.5px; background:#fff; }

        .ap-select-wrap { position:relative; display:flex; align-items:center; }
        .ap-select-fancy {
          appearance:none; -webkit-appearance:none; width:100%;
          border:1px solid var(--line); border-radius:8px; background:#fff;
          padding:9px 34px 9px 12px; font-size:13.5px; color:var(--ink);
          cursor:pointer; transition:border-color .15s, box-shadow .15s;
        }
        .ap-select-fancy:hover { border-color:var(--brass); }
        .ap-select-fancy:focus { outline:none; border-color:var(--brass); box-shadow:0 0 0 3px var(--brass-soft); }
        .ap-select-fancy option[value=""] { color:var(--slate); }
        .ap-select-chevron { position:absolute; right:11px; color:var(--slate); pointer-events:none; }

        .ap-segmented { display:flex; border:1px solid var(--line); border-radius:8px; overflow:hidden; }
        .ap-segmented button { flex:1; background:#fff; border:none; padding:9px 0; font-size:13px; color:var(--slate); border-right:1px solid var(--line); }
        .ap-segmented button:last-child { border-right:none; }
        .ap-segmented button.active { background:var(--ink); color:var(--paper); font-weight:600; }

        .ap-field-hint { font-size:11px; margin-top:2px; }
        .ap-field-hint-error { color:var(--crimson); }

        .ap-summary { flex-direction:row; align-items:flex-start; }
        .ap-summary-vert { flex-direction:column; align-items:flex-start; gap:6px; }
        .ap-summary-right { text-align:right; }

        .ap-actions { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
        .ap-error { color:var(--crimson); font-size:12.5px; display:flex; align-items:center; gap:5px; }

        .ap-confirm-icon { width:52px; height:52px; border-radius:50%; background:var(--sage-soft); color:var(--sage); display:flex; align-items:center; justify-content:center; margin:0 auto; }
        .ap-policy { font-size:12.5px; color:var(--slate); padding-left:18px; margin:0; display:flex; flex-direction:column; gap:5px; }

        .ap-pill { font-size:10.5px; padding:3px 9px; border-radius:12px; font-weight:600; text-transform:uppercase; letter-spacing:.03em; }
        .ap-pill-slate { background:var(--paper-dim); color:var(--slate); }
        .ap-pill-sage { background:var(--sage-soft); color:var(--sage); }
        .ap-pill-crimson { background:var(--crimson-soft); color:var(--crimson); }
        .ap-pill-brass { background:var(--brass-soft); color:#6B4E17; }

        .ap-notice { display:flex; gap:10px; background:var(--paper-dim); border:1px solid var(--line); border-radius:10px; padding:12px 14px; font-size:13px; align-items:flex-start; }
        .ap-notice svg { flex:none; margin-top:2px; color:var(--brass); }
        .ap-notice-crimson { background:var(--crimson-soft); border-color:transparent; }
        .ap-notice-crimson svg { color:var(--crimson); }
        .ap-notice-sage { background:var(--sage-soft); border-color:transparent; }
        .ap-notice-sage svg { color:var(--sage); }

        .ap-empty { padding:20px; }

        .ap-barber-switch { display:flex; align-items:center; gap:10px; font-size:12.5px; color:var(--slate); }
        .ap-barber-switch select { border:1px solid var(--line); border-radius:8px; padding:6px 10px; background:#fff; font-size:13px; color:var(--ink); }

        .ap-tabbar { display:flex; gap:4px; border-bottom:1px solid var(--line); flex-wrap:wrap; }
        .ap-subtabbar { border-bottom:1px dashed var(--line); margin-bottom:4px; }
        .ap-tab { background:none; border:none; padding:9px 12px; font-size:13px; color:var(--slate); display:flex; align-items:center; gap:6px; border-bottom:2px solid transparent; margin-bottom:-1px; }
        .ap-tab.active { color:var(--ink); border-bottom-color:var(--brass); font-weight:600; }

        .ap-stat-row { display:flex; gap:12px; flex-wrap:wrap; }
        .ap-stat { flex-direction:column; align-items:flex-start; gap:4px; min-width:110px; }

        .ap-list { display:flex; flex-direction:column; gap:6px; }
        .ap-list-row { display:flex; justify-content:space-between; align-items:center; background:#fff; border:1px solid var(--line); border-radius:8px; padding:9px 13px; font-size:13px; }
        .ap-booking-row { align-items:flex-start; }
        .ap-inline-edit { display:flex; gap:6px; align-items:center; margin-top:4px; }
        .ap-inline-edit input { border:1px solid var(--line); border-radius:6px; padding:5px 8px; font-size:12px; min-width:220px; }
        .ap-booking-right { display:flex; flex-direction:column; align-items:flex-end; gap:6px; }
        .ap-row-actions { display:flex; gap:6px; }
        .ap-reschedule-pending { display:flex; flex-direction:column; align-items:flex-end; gap:4px; }
        .ap-pending-review { display:flex; flex-direction:column; align-items:flex-end; gap:6px; max-width:220px; text-align:right; }

        .ap-service-table { display:flex; flex-direction:column; gap:6px; }
        .ap-service-row { display:grid; grid-template-columns:2fr 1fr 1fr 32px; gap:8px; align-items:center; }
        .ap-service-head { font-size:11px; color:var(--slate); text-transform:uppercase; letter-spacing:.05em; }
        .ap-service-row input { border:1px solid var(--line); border-radius:7px; padding:7px 9px; font-size:13px; width:100%; background:#fff; }
        .ap-input-prefix { display:flex; align-items:center; border:1px solid var(--line); border-radius:7px; background:#fff; padding-left:8px; }
        .ap-input-prefix span { color:var(--slate); font-size:12px; }
        .ap-input-prefix input { border:none; }
        .ap-icon-btn { background:none; border:none; color:var(--crimson); padding:6px; }

        .ap-settings-row { flex-direction:row; }
        .ap-switch { width:40px; height:22px; border-radius:12px; background:var(--paper-dim); border:1px solid var(--line); position:relative; flex:none; }
        .ap-switch span { position:absolute; top:2px; left:2px; width:16px; height:16px; border-radius:50%; background:#fff; box-shadow:0 1px 2px rgba(0,0,0,.2); transition:.15s; }
        .ap-switch.on { background:var(--sage); border-color:var(--sage); }
        .ap-switch.on span { left:20px; }

        .ap-admin-head { display:flex; align-items:center; gap:8px; color:var(--ink); }
        .ap-admin-table { display:flex; flex-direction:column; gap:6px; }
        .ap-admin-row { display:grid; grid-template-columns:2fr 1.3fr 1fr 1fr auto; gap:10px; align-items:center; background:#fff; border:1px solid var(--line); border-radius:8px; padding:9px 13px; font-size:13px; }
        .ap-admin-head-row { background:transparent; border:none; font-size:11px; color:var(--slate); text-transform:uppercase; letter-spacing:.05em; padding:0 13px; }
        .ap-admin-invite-row, .ap-admin-invite-head-row { grid-template-columns:1.5fr 1.2fr .7fr .9fr .7fr 1fr; }
        .ap-admin-cancel-row, .ap-admin-cancel-head-row { grid-template-columns:1.4fr 1.2fr .6fr 1.8fr 1fr; }
        .ap-geo-row, .ap-geo-head-row { grid-template-columns:1fr .6fr 2.5fr; }
        .ap-region-row, .ap-region-head-row { grid-template-columns:1.3fr .6fr .8fr .8fr .8fr 1.6fr; }
        .ap-trend-row { display:flex; gap:24px; flex-wrap:wrap; }
        .ap-trend-mini { display:flex; gap:14px; }
        .ap-trend-mini span { display:flex; flex-direction:column; align-items:center; gap:2px; font-size:11px; }
        .ap-trend-mini .ap-mono { font-size:15px; font-weight:600; color:var(--ink); }

        .ap-report-filters { display:flex; flex-wrap:wrap; align-items:center; gap:12px; }
        .ap-report-mode { flex:none; width:auto; }
        .ap-report-mode button { padding:8px 14px; white-space:nowrap; }
        .ap-report-filters input[type="date"], .ap-report-filters input[type="month"] { border:1px solid var(--line); border-radius:8px; padding:8px 11px; font-size:13px; background:#fff; }
        .ap-report-range { display:flex; gap:10px; }
        .ap-log-search { border:1px solid var(--line); border-radius:8px; padding:8px 12px; font-size:13px; background:#fff; flex:1; min-width:220px; }

        .ap-audit-table { display:flex; flex-direction:column; gap:6px; max-height:420px; overflow-y:auto; }
        .ap-audit-row { display:grid; grid-template-columns:1.3fr 1.4fr 1fr 1.3fr 1.3fr 1.3fr; gap:10px; align-items:center; background:#fff; border:1px solid var(--line); border-radius:8px; padding:9px 13px; font-size:12px; }
        .ap-audit-head-row { background:transparent; border:none; font-size:11px; color:var(--slate); text-transform:uppercase; letter-spacing:.05em; padding:0 13px; }

        .ap-report-table { display:flex; flex-direction:column; gap:6px; }
        .ap-report-row { display:grid; grid-template-columns:1.3fr 1.2fr 1.3fr .7fr .9fr .9fr; gap:10px; align-items:center; background:#fff; border:1px solid var(--line); border-radius:8px; padding:9px 13px; font-size:12.5px; }
        .ap-report-head-row { background:transparent; border:none; font-size:11px; color:var(--slate); text-transform:uppercase; letter-spacing:.05em; padding:0 13px; }

        @media print {
          .ap-topbar, .ap-demo-banner, .ap-tabbar, .ap-actions, .ap-barber-switch, .ap-notice { display:none !important; }
          .ap-body { max-height:none !important; overflow:visible !important; }
        }

        .ap-toast { position:fixed; bottom:18px; left:50%; transform:translateX(-50%); background:var(--ink); color:var(--paper); padding:10px 16px; border-radius:24px; font-size:12.5px; display:flex; align-items:center; gap:8px; box-shadow:0 8px 24px rgba(0,0,0,.25); z-index:50; }
        .ap-toast button { background:none; border:none; color:var(--paper); opacity:.6; }

        @media (max-width:560px) {
          .ap-form-grid { grid-template-columns:1fr; }
          .ap-h1 { font-size:26px; }
          .ap-admin-row, .ap-admin-head-row { grid-template-columns:1.4fr 1fr 1fr; font-size:11.5px; }
          .ap-admin-row span:nth-child(4), .ap-admin-head-row span:nth-child(4) { display:none; }
        }
      `}</style>

      <div className="ap-topbar">
        <div className="ap-brand"><span className="mark"><Scissors size={14} /></span> Appointa</div>

        {role === "customer" ? (
          <div className="ap-staff-links">
            {STAFF_ROLES.map((r) => (
              <button key={r.id} className="ap-staff-link" onClick={() => setRole(r.id)}>
                <r.icon size={12} /> {r.label}
              </button>
            ))}
          </div>
        ) : (
          <div className="ap-staff-links">
            <button className="ap-back-to-site" onClick={() => setRole("customer")}>
              <ChevronLeft size={14} /> Back to booking site
            </button>
            {role === "barber" && loggedInBarberId && (
              <button
                className="ap-staff-link"
                onClick={() => {
                  const b = barbers.find((x) => x.id === loggedInBarberId);
                  logAudit({ type: "logout", actor: b?.name || loggedInBarberId });
                  setLoggedInBarberId(null);
                }}
              >
                <LogOut size={12} /> Log out
              </button>
            )}
          </div>
        )}
      </div>
      <div className="ap-demo-banner">
        Prototype — payments, SMS and subscription billing are simulated, no real charges occur.
        {role !== "customer" && " In the real product, this dashboard lives on a separate, login-only page — customers never see it."}
      </div>

      <div className="ap-body">
        <div className="ap-container">
        {role === "customer" && (
          <CustomerApp
            barbers={barbers} setBarbers={setBarbers} servicesByBarber={servicesByBarber} photosByBarber={photosByBarber}
            calendarByBarber={calendarByBarber} setCalendarByBarber={setCalendarByBarber}
            bookings={bookings} setBookings={setBookings}
            invites={invites} setInvites={setInvites}
            cancellationFlags={cancellationFlags} setCancellationFlags={setCancellationFlags}
            rescheduleRequests={rescheduleRequests} setRescheduleRequests={setRescheduleRequests}
            auditLog={auditLog} notify={notify} logAudit={logAudit}
          />
        )}
        {role === "barber" && (
          loggedInBarberId ? (
            <BarberApp
              barbers={barbers} setBarbers={setBarbers}
              servicesByBarber={servicesByBarber} setServicesByBarber={setServicesByBarber}
              photosByBarber={photosByBarber} setPhotosByBarber={setPhotosByBarber}
              calendarByBarber={calendarByBarber} setCalendarByBarber={setCalendarByBarber}
              bookings={bookings} setBookings={setBookings}
              rescheduleRequests={rescheduleRequests} setRescheduleRequests={setRescheduleRequests}
              auditLog={auditLog} notify={notify} initialActiveId={loggedInBarberId} logAudit={logAudit}
            />
          ) : (
            <BarberAuthApp
              barbers={barbers} setBarbers={setBarbers}
              servicesByBarber={servicesByBarber} setServicesByBarber={setServicesByBarber}
              photosByBarber={photosByBarber} setPhotosByBarber={setPhotosByBarber}
              calendarByBarber={calendarByBarber} setCalendarByBarber={setCalendarByBarber}
              barberAccounts={barberAccounts} setBarberAccounts={setBarberAccounts}
              onLoggedIn={setLoggedInBarberId} notify={notify} logAudit={logAudit}
            />
          )
        )}
        </div>
      </div>

      <Toast message={toast} onClose={() => setToast("")} />
    </div>
  );
}
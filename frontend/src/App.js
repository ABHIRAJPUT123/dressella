import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/context/AuthContext";
import { CartProvider } from "@/context/CartContext";
import { WishlistProvider } from "@/context/WishlistContext";
import { ConsentProvider } from "@/context/ConsentContext";
import { Layout } from "@/components/Layout";
import Home from "@/pages/Home";
import Shop from "@/pages/Shop";
import NotFound, { ErrorBoundary } from "@/pages/NotFound";
import { ContentPage, Contact, TrackOrder, CollectionsIndex, SizeGuidePage } from "@/pages/InfoPages";
import { Login, Register, ForgotPassword, ResetPassword } from "@/pages/AuthPages";
import ReturnsPolicy from "@/pages/ReturnsPolicy";

const Product = lazy(() => import("@/pages/Product"));
const Checkout = lazy(() => import("@/pages/Checkout"));
const OrderView = lazy(() => import("@/pages/OrderView"));
const Account = lazy(() => import("@/pages/Account"));
const Wishlist = lazy(() => import("@/pages/Wishlist"));
const AdminLayout = lazy(() => import("@/admin/AdminLayout"));
const AdminDashboard = lazy(() => import("@/admin/AdminDashboard"));
const AdminProducts = lazy(() => import("@/admin/AdminProducts").then((m) => ({ default: m.AdminProducts })));
const AdminProductEdit = lazy(() => import("@/admin/AdminProducts").then((m) => ({ default: m.AdminProductEdit })));
const AdminOrders = lazy(() => import("@/admin/AdminOrders"));
const AdminBulkPricing = lazy(() => import("@/admin/AdminBulkPricing"));
const AdminEmails = lazy(() => import("@/admin/AdminEmails"));
const AdminCoupons = lazy(() => import("@/admin/AdminMisc").then((m) => ({ default: m.AdminCoupons })));
const AdminCustomers = lazy(() => import("@/admin/AdminMisc").then((m) => ({ default: m.AdminCustomers })));
const AdminNewsletter = lazy(() => import("@/admin/AdminMisc").then((m) => ({ default: m.AdminNewsletter })));
const AdminContent = lazy(() => import("@/admin/AdminContent"));
const AdminExchanges = lazy(() => import("@/admin/AdminExchanges"));
const AdminRack = lazy(() => import("@/admin/AdminRack"));

const Fallback = () => <div className="container-luxe py-24" aria-busy="true"><div className="h-8 w-1/3 animate-pulse bg-linen" /></div>;

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <ConsentProvider>
          <AuthProvider>
            <WishlistProvider>
              <CartProvider>
                <Suspense fallback={<Fallback />}>
                  <Routes>
                    <Route element={<Layout />}>
                      <Route index element={<Home />} />
                      <Route path="shop" element={<Shop />} />
                      <Route path="new-in" element={<Shop />} />
                      <Route path="sale" element={<Shop />} />
                      <Route path="search" element={<Shop />} />
                      <Route path="category/:slug" element={<Shop />} />
                      <Route path="collections" element={<CollectionsIndex />} />
                      <Route path="collections/:slug" element={<Shop />} />
                      <Route path="product/:slug" element={<Product />} />
                      <Route path="checkout" element={<Checkout />} />
                      <Route path="order/:id" element={<OrderView />} />
                      <Route path="returns" element={<ReturnsPolicy />} />
                      <Route path="login" element={<Login />} />
                      <Route path="register" element={<Register />} />
                      <Route path="forgot-password" element={<ForgotPassword />} />
                      <Route path="reset-password" element={<ResetPassword />} />
                      <Route path="account" element={<Account />} />
                      <Route path="wishlist" element={<Wishlist />} />
                      <Route path="track-order" element={<TrackOrder />} />
                      <Route path="contact" element={<Contact />} />
                      <Route path="size-guide" element={<SizeGuidePage />} />
                      {["about", "faq", "shipping-policy", "privacy-policy", "terms"].map((s) => <Route key={s} path={s} element={<ContentPage slug={s} />} />)}
                      <Route path="*" element={<NotFound />} />
                    </Route>
                    <Route path="admin" element={<AdminLayout />}>
                      <Route index element={<AdminDashboard />} />
                      <Route path="products" element={<AdminProducts />} />
                      <Route path="products/bulk" element={<AdminBulkPricing />} />
                      <Route path="products/:id" element={<AdminProductEdit />} />
                      <Route path="orders" element={<AdminOrders />} />
                      <Route path="exchanges" element={<AdminExchanges />} />
                      <Route path="emails" element={<AdminEmails />} />
                      <Route path="coupons" element={<AdminCoupons />} />
                      <Route path="customers" element={<AdminCustomers />} />
                      <Route path="newsletter" element={<AdminNewsletter />} />
                      <Route path="content" element={<AdminContent />} />
                      <Route path="rack" element={<AdminRack />} />
                    </Route>
                  </Routes>
                </Suspense>
                <Toaster position="top-center" toastOptions={{ className: "rounded-none border-line bg-ivory font-sans" }} />
              </CartProvider>
            </WishlistProvider>
          </AuthProvider>
        </ConsentProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

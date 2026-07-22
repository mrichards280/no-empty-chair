import React, { Suspense, lazy } from "react";
import { Routes, Route } from "react-router-dom";
import Site from "./components/Site";

// Admin is lazy-loaded so its editor code never ships to normal visitors.
const Admin = lazy(() => import("./admin/Admin"));

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Site />} />
      <Route
        path="/admin"
        element={
          <Suspense fallback={<div className="loading">Loading editor…</div>}>
            <Admin />
          </Suspense>
        }
      />
      <Route path="*" element={<Site />} />
    </Routes>
  );
}

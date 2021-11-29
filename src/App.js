import { useEffect, useState } from "react";
import Header from "./Header/Header";
import LeafletMap from "./LeafletMap/LeafletMap.jsx"

export default function Home() {

  return (
    <>
      <main>
        <Header />
        <LeafletMap />
      </main>
    </>
  );
}

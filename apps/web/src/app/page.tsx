"use client";

import dynamic from "next/dynamic";

const Map = dynamic(() => import("@/components/Map"), { ssr: false });

const Home = () => {
  return (
    <main className="h-screen w-screen">
      <Map />
    </main>
  );
};

export default Home;

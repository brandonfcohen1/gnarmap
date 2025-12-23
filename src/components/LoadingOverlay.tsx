"use client";

export default function LoadingOverlay() {
  return (
    <div className="absolute inset-0 z-40 bg-gray-100 flex flex-col items-center justify-center">
      <div className="relative w-24 h-24 mb-4">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="absolute w-3 h-3 bg-blue-400 rounded-full opacity-80"
            style={{
              left: `${50 + 35 * Math.cos((i * Math.PI) / 3)}%`,
              top: `${50 + 35 * Math.sin((i * Math.PI) / 3)}%`,
              transform: "translate(-50%, -50%)",
              animation: `snowfall 1.5s ease-in-out infinite`,
              animationDelay: `${i * 0.25}s`,
            }}
          />
        ))}
        <div
          className="absolute w-4 h-4 bg-blue-500 rounded-full opacity-90"
          style={{
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            animation: "pulse 1.5s ease-in-out infinite",
          }}
        />
      </div>
      <p className="text-gray-600 text-sm font-medium">Loading snow data...</p>
      <style jsx>{`
        @keyframes snowfall {
          0%, 100% {
            transform: translate(-50%, -50%) scale(1);
            opacity: 0.8;
          }
          50% {
            transform: translate(-50%, -70%) scale(0.6);
            opacity: 0.4;
          }
        }
        @keyframes pulse {
          0%, 100% {
            transform: translate(-50%, -50%) scale(1);
          }
          50% {
            transform: translate(-50%, -50%) scale(1.3);
          }
        }
      `}</style>
    </div>
  );
}

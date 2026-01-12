"use client";

interface InfoModalProps {
  open: boolean;
  onClose: () => void;
}

const InfoModal = ({ open, onClose }: InfoModalProps) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-gray-500 bg-opacity-75"
        onClick={onClose}
      />
      <div className="relative bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-5">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            Welcome to GnarMap
          </h3>
          <div className="text-sm text-gray-500 space-y-4">
            <p>
              This is a simple app to visualize the{" "}
              <a
                href="https://www.nohrsc.noaa.gov/nsa/"
                target="_blank"
                rel="noreferrer noopener"
                className="text-blue-600 hover:underline"
              >
                NOHRSC
              </a>{" "}
              Snow Depth map and underlying site observations. In their words:
            </p>
            <blockquote className="italic border-l-4 border-gray-300 pl-4">
              The NOHRSC National Snow Analyses (NSA) provide daily
              comprehensive snow information for the coterminous United States.
              The NSA are based on modeled snow pack characteristics that are
              updated each day using all operationally available ground,
              airborne, and satellite observations of snow water equivalent,
              snow depth, and snow cover.
            </blockquote>
            <p>
              The snow depths displayed here are <strong>modeled</strong> to 1km
              resolution, so this map can&apos;t tell whether a particular line
              is in, but can help answer generally what sort of snow coverage to
              expect. This tool should not be used to evaluate avalanche or
              other safety conditions.
            </p>
            <p>
              In addition to the snow depth color layer, you can load site
              observation data for snow depth, snow coverage, and recent
              snowfall for all of the sites which the NOHRSC uses to build this
              model.
            </p>
            <p>
              You can also load historical data back to 2003 for the full map or
              as a chart for a given point. Click on a point then{" "}
              <i>View History</i> to load this.
            </p>
            <p>
              This project is{" "}
              <a
                href="https://github.com/brandonfcohen1/gnarmap"
                target="_blank"
                rel="noreferrer noopener"
                className="text-blue-600 hover:underline"
              >
                open source
              </a>
              . Feel free to check it out, contribute, or{" "}
              <a
                href="mailto:brandon@gnarmap.com"
                target="_blank"
                rel="noreferrer noopener"
                className="text-blue-600 hover:underline"
              >
                get in touch
              </a>{" "}
              with any questions.
            </p>
          </div>
        </div>
        <div className="bg-gray-50 px-6 py-3 flex justify-end rounded-b-lg">
          <button
            type="button"
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default InfoModal;

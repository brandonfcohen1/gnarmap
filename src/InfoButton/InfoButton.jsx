//MyComponent.jsx
import { useEffect, useState, Fragment } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import { Dialog, Transition } from "@headlessui/react";
import "./InfoButton.css";
require("leaflet-easybutton");
require("leaflet-easybutton/src/easy-button.css");

export default function InfoButton(props) {
  const map = useMap();
  const [open, setOpen] = useState(true);

  useEffect(() => {
    const icon = `<svg xmlns="http://www.w3.org/2000/svg"  fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg></div>`;

    L.easyButton(icon, function (btn, map) {
      setOpen(true);
    }).addTo(map);
  }, [map]);

  return (
    <Transition.Root show={open} as={Fragment}>
      <Dialog
        as="div"
        className="fixed z-10 inset-0 overflow-y-auto"
        onClose={setOpen}
      >
        <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <Dialog.Overlay className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" />
          </Transition.Child>

          {/* This element is to trick the browser into centering the modal contents. */}
          {/* <span
            className="hidden sm:inline-block sm:align-middle sm:h-screen"
            aria-hidden="true"
          >
            &#8203;
          </span> */}
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            enterTo="opacity-100 translate-y-0 sm:scale-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100 translate-y-0 sm:scale-100"
            leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
          >
            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <div className="sm:flex sm:items-start">
                  <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                    <Dialog.Title
                      as="h3"
                      className="text-lg leading-6 font-medium text-gray-900"
                    >
                      Welcome to GnarMap
                    </Dialog.Title>
                    <div className="mt-2">
                      <p className="text-sm text-gray-500">
                        This is a simple app to visualize the{" "}
                        <a
                          href="https://www.nohrsc.noaa.gov/nsa/"
                          target="_blank"
                          rel="noreferrer noopener"
                          className={"modalLink"}
                        >
                          NOHRSC{" "}
                        </a>{" "}
                        Snow Depth map and underlying site observations. In
                        their words: <br />
                        <br />
                        <i>
                          The NOHRSC National Snow Analyses (NSA) provide daily
                          comprehensive snow information for the coterminous
                          United States. The NSA are based on modeled snow pack
                          characteristics that are updated each day using all
                          operationally available ground, airborne, and
                          satellite observations of snow water equivalent, snow
                          depth, and snow cover.
                        </i>
                        <br />
                        <br />
                        The snow depths displayed here are <b>modeled</b> to 1km
                        resolution, so this map can't tell whether a particular
                        line is in, but can help answer generally what sort of
                        snow coverage to expect. This tool should not be used to
                        evaluate avalanche or other safety conditions.
                        <br />
                        <br />
                        In addition to the snow depth color layer, you can load
                        site observation data for snow depth, snow coverage, and
                        recent snowfall for all of the sites which the NOHRSC
                        uses to build this model.
                        <br />
                        <br />
                        This project is{" "}
                        <a
                          href="https://github.com/brandonfcohen1/gnarmap"
                          target="_blank"
                          rel="noreferrer noopener"
                          className={"modalLink"}
                        >
                          open source
                        </a>
                        . Feel free to check it out, contribute, or{" "}
                        <a
                          href="mailto:brandon@gnarmap.com"
                          target="_blank"
                          rel="noreferrer noopener"
                          className={"modalLink"}
                        >
                          get in touch
                        </a>{" "}
                        with any questions.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                <button
                  type="button"
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                  onClick={() => setOpen(false)}
                >
                  Close
                </button>
              </div>
            </div>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition.Root>
  );
}

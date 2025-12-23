"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";

interface DatePickerProps {
  selectedDate: string | null;
  onDateChange: (date: string) => void;
  enabled?: boolean;
  onReady?: () => void;
}

type ViewMode = "days" | "months" | "years";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function parseDate(dateStr: string): Date {
  const year = parseInt(dateStr.slice(0, 4));
  const month = parseInt(dateStr.slice(4, 6)) - 1;
  const day = parseInt(dateStr.slice(6, 8));
  return new Date(year, month, day);
}

function formatDateStr(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function formatDisplayDate(dateStr: string): string {
  const date = parseDate(dateStr);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function DatePicker({ selectedDate, onDateChange, enabled = true, onReady }: DatePickerProps) {
  const [availableDates, setAvailableDates] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("days");
  const dropdownRef = useRef<HTMLDivElement>(null);

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    availableDates.forEach((d) => years.add(parseInt(d.slice(0, 4))));
    return Array.from(years).sort((a, b) => b - a);
  }, [availableDates]);

  const availableMonthsInYear = useMemo(() => {
    const year = viewDate.getFullYear();
    const months = new Set<number>();
    availableDates.forEach((d) => {
      if (parseInt(d.slice(0, 4)) === year) {
        months.add(parseInt(d.slice(4, 6)) - 1);
      }
    });
    return months;
  }, [availableDates, viewDate]);

  const [hasFetched, setHasFetched] = useState(false);

  useEffect(() => {
    if (!enabled || hasFetched) return;

    setHasFetched(true);
    fetch("/api/dates")
      .then((res) => res.json())
      .then((data) => {
        const dateSet = new Set<string>(data.dates || []);
        setAvailableDates(dateSet);
        if (data.dates?.length > 0 && !selectedDate) {
          onDateChange(data.dates[0]);
          setViewDate(parseDate(data.dates[0]));
        } else if (selectedDate) {
          setViewDate(parseDate(selectedDate));
        }
        setLoading(false);
        onReady?.();
      })
      .catch(() => {
        setLoading(false);
        onReady?.();
      });
  }, [enabled, hasFetched, selectedDate, onDateChange, onReady]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setViewMode("days");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const getDaysInMonth = useCallback((date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDay = firstDay.getDay();

    const days: (number | null)[] = [];
    for (let i = 0; i < startingDay; i++) {
      days.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i);
    }
    return days;
  }, []);

  const prevMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
  };

  const prevYear = () => {
    setViewDate(new Date(viewDate.getFullYear() - 1, viewDate.getMonth(), 1));
  };

  const nextYear = () => {
    setViewDate(new Date(viewDate.getFullYear() + 1, viewDate.getMonth(), 1));
  };

  const prevDecade = () => {
    setViewDate(new Date(viewDate.getFullYear() - 12, viewDate.getMonth(), 1));
  };

  const nextDecade = () => {
    setViewDate(new Date(viewDate.getFullYear() + 12, viewDate.getMonth(), 1));
  };

  const selectDate = (day: number) => {
    const newDate = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
    const dateStr = formatDateStr(newDate);
    if (availableDates.has(dateStr)) {
      onDateChange(dateStr);
      setIsOpen(false);
    }
  };

  const selectMonth = (month: number) => {
    setViewDate(new Date(viewDate.getFullYear(), month, 1));
    setViewMode("days");
  };

  const selectYear = (year: number) => {
    setViewDate(new Date(year, viewDate.getMonth(), 1));
    setViewMode("months");
  };

  const isDateAvailable = (day: number): boolean => {
    const dateStr = formatDateStr(new Date(viewDate.getFullYear(), viewDate.getMonth(), day));
    return availableDates.has(dateStr);
  };

  const isSelectedDate = (day: number): boolean => {
    if (!selectedDate) return false;
    const dateStr = formatDateStr(new Date(viewDate.getFullYear(), viewDate.getMonth(), day));
    return dateStr === selectedDate;
  };

  const isYearAvailable = (year: number): boolean => {
    return availableYears.includes(year);
  };

  const getYearsForView = (): number[] => {
    const currentYear = viewDate.getFullYear();
    const startYear = currentYear - 5;
    const years: number[] = [];
    for (let i = 0; i < 12; i++) {
      years.push(startYear + i);
    }
    return years;
  };

  if (loading) {
    return (
      <div className="absolute top-4 left-16 z-10 bg-white rounded-md p-2 shadow-md">
        <span className="text-sm text-gray-500">Loading...</span>
      </div>
    );
  }

  const days = getDaysInMonth(viewDate);
  const yearsForView = getYearsForView();

  return (
    <div ref={dropdownRef} className="absolute top-4 left-16 z-10">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="bg-white rounded-md px-3 py-2 shadow-md hover:bg-gray-100 flex items-center gap-2"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          className="w-5 h-5"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
          />
        </svg>
        <span className="text-sm font-medium">
          {selectedDate ? formatDisplayDate(selectedDate) : "Select Date"}
        </span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute mt-1 bg-white rounded-md shadow-lg p-3 w-72">
          {viewMode === "days" && (
            <>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1">
                  <button
                    onClick={prevYear}
                    className="p-1 hover:bg-gray-100 rounded text-gray-600"
                    title="Previous year"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M18.75 19.5l-7.5-7.5 7.5-7.5m-6 15L5.25 12l7.5-7.5" />
                    </svg>
                  </button>
                  <button
                    onClick={prevMonth}
                    className="p-1 hover:bg-gray-100 rounded text-gray-600"
                    title="Previous month"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                    </svg>
                  </button>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setViewMode("months")}
                    className="text-sm font-semibold hover:bg-gray-100 px-2 py-1 rounded"
                  >
                    {MONTHS[viewDate.getMonth()]}
                  </button>
                  <button
                    onClick={() => setViewMode("years")}
                    className="text-sm font-semibold hover:bg-gray-100 px-2 py-1 rounded"
                  >
                    {viewDate.getFullYear()}
                  </button>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={nextMonth}
                    className="p-1 hover:bg-gray-100 rounded text-gray-600"
                    title="Next month"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                  </button>
                  <button
                    onClick={nextYear}
                    className="p-1 hover:bg-gray-100 rounded text-gray-600"
                    title="Next year"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 4.5l7.5 7.5-7.5 7.5m-6-15l7.5 7.5-7.5 7.5" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-7 gap-1 mb-1">
                {DAYS.map((day) => (
                  <div key={day} className="text-center text-xs font-medium text-gray-500 py-1">
                    {day}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {days.map((day, i) => (
                  <div key={i} className="aspect-square">
                    {day !== null && (
                      <button
                        onClick={() => selectDate(day)}
                        disabled={!isDateAvailable(day)}
                        className={`w-full h-full text-xs rounded flex items-center justify-center transition-colors
                          ${isSelectedDate(day)
                            ? "bg-blue-600 text-white"
                            : isDateAvailable(day)
                              ? "hover:bg-blue-100 text-gray-900"
                              : "text-gray-300 cursor-not-allowed"
                          }`}
                      >
                        {day}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {viewMode === "months" && (
            <>
              <div className="flex items-center justify-between mb-3">
                <button
                  onClick={prevYear}
                  className="p-1 hover:bg-gray-100 rounded text-gray-600"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                  </svg>
                </button>
                <button
                  onClick={() => setViewMode("years")}
                  className="text-sm font-semibold hover:bg-gray-100 px-2 py-1 rounded"
                >
                  {viewDate.getFullYear()}
                </button>
                <button
                  onClick={nextYear}
                  className="p-1 hover:bg-gray-100 rounded text-gray-600"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {MONTHS.map((month, i) => (
                  <button
                    key={month}
                    onClick={() => selectMonth(i)}
                    disabled={!availableMonthsInYear.has(i)}
                    className={`py-2 text-sm rounded transition-colors
                      ${viewDate.getMonth() === i && selectedDate?.slice(0, 4) === String(viewDate.getFullYear())
                        ? "bg-blue-600 text-white"
                        : availableMonthsInYear.has(i)
                          ? "hover:bg-blue-100 text-gray-900"
                          : "text-gray-300 cursor-not-allowed"
                      }`}
                  >
                    {month}
                  </button>
                ))}
              </div>
            </>
          )}

          {viewMode === "years" && (
            <>
              <div className="flex items-center justify-between mb-3">
                <button
                  onClick={prevDecade}
                  className="p-1 hover:bg-gray-100 rounded text-gray-600"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                  </svg>
                </button>
                <span className="text-sm font-semibold">
                  {yearsForView[0]} - {yearsForView[yearsForView.length - 1]}
                </span>
                <button
                  onClick={nextDecade}
                  className="p-1 hover:bg-gray-100 rounded text-gray-600"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {yearsForView.map((year) => (
                  <button
                    key={year}
                    onClick={() => selectYear(year)}
                    disabled={!isYearAvailable(year)}
                    className={`py-2 text-sm rounded transition-colors
                      ${selectedDate?.slice(0, 4) === String(year)
                        ? "bg-blue-600 text-white"
                        : isYearAvailable(year)
                          ? "hover:bg-blue-100 text-gray-900"
                          : "text-gray-300 cursor-not-allowed"
                      }`}
                  >
                    {year}
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="mt-2 pt-2 border-t text-xs text-gray-500 text-center">
            {availableDates.size.toLocaleString()} dates available
          </div>
        </div>
      )}
    </div>
  );
}

import { createContext, useContext, useState } from 'react';

const AttendanceContext = createContext(null);

export function AttendanceProvider({ children }) {
  const [currentSession, setCurrentSession] = useState(null);
  const [todayRecords, setTodayRecords] = useState([]);

  const value = {
    currentSession,
    setCurrentSession,
    todayRecords,
    setTodayRecords,
  };

  return <AttendanceContext.Provider value={value}>{children}</AttendanceContext.Provider>;
}

export function useAttendance() {
  const ctx = useContext(AttendanceContext);
  if (!ctx) throw new Error('useAttendance must be used inside <AttendanceProvider>');
  return ctx;
}

export default AttendanceContext;

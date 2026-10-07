import React from 'react'
import {
  Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts'

function localTime(value, withDay = false) {
  return new Intl.DateTimeFormat('en-SG', {
    timeZone: 'Asia/Singapore',
    hour: '2-digit',
    minute: '2-digit',
    day: withDay ? 'numeric' : undefined,
    month: withDay ? 'short' : undefined,
  }).format(new Date(value))
}

export function HistoryChart({ data }) {
  return <ResponsiveContainer width="100%" height="100%">
    <AreaChart data={data} margin={{ top: 10, right: 8, left: -20, bottom: 0 }}>
      <defs>
        <linearGradient id="pmFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#246bfd" stopOpacity={.28}/>
          <stop offset="100%" stopColor="#246bfd" stopOpacity={0}/>
        </linearGradient>
      </defs>
      <CartesianGrid stroke="#e9edf3" vertical={false}/>
      <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={48} axisLine={false} tickLine={false}/>
      <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false}/>
      <Tooltip
        contentStyle={{ borderRadius: 12, border: '1px solid #e2e7ef' }}
        labelStyle={{ color: '#667085' }}
        formatter={(value, name) => [`${value} µg/m³`, name === 'pm25_ma3' ? '3-hour average' : 'Hourly PM2.5']}
      />
      <Area type="monotone" dataKey="pm25_1h" name="Hourly PM2.5" stroke="#246bfd" strokeWidth={2.5} fill="url(#pmFill)"/>
      <Line type="monotone" dataKey="pm25_ma3" name="3-hour average" stroke="#8b5cf6" strokeWidth={2} strokeDasharray="5 5" dot={false}/>
    </AreaChart>
  </ResponsiveContainer>
}

export function ForecastChart({ data }) {
  return <ResponsiveContainer width="100%" height="100%">
    <LineChart data={data}>
      <CartesianGrid stroke="#edf0f4" vertical={false}/>
      <XAxis dataKey="timestamp" tickFormatter={value => localTime(value)} axisLine={false} tickLine={false}/>
      <YAxis domain={['auto', 'auto']} axisLine={false} tickLine={false}/>
      <Tooltip labelFormatter={value => localTime(value, true)} formatter={(value, name) => [`${value} µg/m³`, name === 'Persistence baseline' ? name : 'OLS estimate']}/>
      <Line type="monotone" dataKey="persistence_pm25_1h" name="Persistence baseline" stroke="#9aa4b2" strokeWidth={2} strokeDasharray="5 5" dot={false}/>
      <Line type="monotone" dataKey="pm25_1h" name="OLS estimate" stroke="#8b5cf6" strokeWidth={3} dot={{ r: 4 }}/>
    </LineChart>
  </ResponsiveContainer>
}

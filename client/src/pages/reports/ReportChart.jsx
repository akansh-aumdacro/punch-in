import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { CHART_PALETTE, STATUS_COLORS } from './reportConfigs';

// Renders the backend's `result.chart` payload as the right recharts widget.
// Shape: { type, data, series? }
export default function ReportChart({ chart }) {
  if (!chart || !chart.data || chart.data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-slate-400 text-sm">
        No data to chart.
      </div>
    );
  }

  const height = 280;

  if (chart.type === 'bar-stacked') {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={chart.data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar stackId="a" dataKey="present" fill={STATUS_COLORS.present} />
          <Bar stackId="a" dataKey="late"    fill={STATUS_COLORS.late} />
          <Bar stackId="a" dataKey="leave"   fill={STATUS_COLORS.leave} />
          <Bar stackId="a" dataKey="absent"  fill={STATUS_COLORS.absent} />
          <Bar stackId="a" dataKey="holiday" fill={STATUS_COLORS.holiday} />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (chart.type === 'line') {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={chart.data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} unit="%" domain={[0, 100]} />
          <Tooltip />
          <Line type="monotone" dataKey="attendancePct" stroke="#0ea5e9" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  if (chart.type === 'bar') {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={chart.data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={50} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Bar dataKey="value" fill="#0ea5e9" />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (chart.type === 'bar-vertical') {
    return (
      <ResponsiveContainer width="100%" height={Math.max(height, chart.data.length * 28)}>
        <BarChart
          layout="vertical"
          data={chart.data}
          margin={{ top: 10, right: 20, left: 100, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis type="number" tick={{ fontSize: 11 }} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} />
          <Tooltip />
          <Bar dataKey="value" fill="#ef4444" />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (chart.type === 'bar-grouped') {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={chart.data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} unit="%" />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {(chart.series || []).map((s, i) => (
            <Bar key={s} dataKey={s} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (chart.type === 'doughnut') {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={chart.data}
            dataKey="value"
            nameKey="name"
            innerRadius={60}
            outerRadius={100}
            paddingAngle={1}
          >
            {chart.data.map((d, i) => (
              <Cell key={d.name} fill={d.color || CHART_PALETTE[i % CHART_PALETTE.length]} />
            ))}
          </Pie>
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 11 }} />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  return (
    <div className="h-64 flex items-center justify-center text-slate-400 text-sm">
      Unknown chart type: {chart.type}
    </div>
  );
}

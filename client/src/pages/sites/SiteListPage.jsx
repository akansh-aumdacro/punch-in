import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus, MapPin, Users, TrendingUp } from 'lucide-react';

import { sitesApi } from '../../api/sites';
import { SkeletonCard, ErrorBox } from '../../components/Skeleton.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

export default function SiteListPage() {
  const { user } = useAuth();
  const canWrite = user?.role === 'superadmin' || user?.role === 'hr';

  const sitesQuery = useQuery({
    queryKey: ['sites', 'with-stats'],
    queryFn: () => sitesApi.list(),
  });

  const items = sitesQuery.data?.items || [];

  return (
    <div className="p-6">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Sites</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Locations, geofences, and live attendance overview.
          </p>
        </div>
        {canWrite && (
          <Link
            to="/sites/new"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm bg-slate-900 text-white hover:bg-slate-800"
          >
            <Plus size={16} /> Add Site
          </Link>
        )}
      </div>

      {sitesQuery.isError && (
        <ErrorBox error={sitesQuery.error} onRetry={() => sitesQuery.refetch()} />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {sitesQuery.isLoading &&
          Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}

        {!sitesQuery.isLoading && items.length === 0 && !sitesQuery.isError && (
          <div className="col-span-full bg-white rounded-lg shadow-sm p-12 text-center text-slate-400">
            No sites yet. {canWrite && <Link to="/sites/new" className="text-slate-700 underline">Create one</Link>}
          </div>
        )}

        {items.map((site) => (
          <Link
            key={site._id}
            to={`/sites/${site._id}`}
            className="bg-white rounded-lg shadow-sm hover:shadow-md transition p-5 block"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-slate-800">{site.name}</h3>
                <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                  <MapPin size={12} /> {site.address || 'No address'}
                </div>
              </div>
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${
                  site.geofenceEnabled
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-slate-200 text-slate-600'
                }`}
              >
                {site.geofenceEnabled ? 'Geofence on' : 'No geofence'}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <Stat icon={Users} label="Workers" value={site.workerCount ?? 0} />
              <Stat
                icon={TrendingUp}
                label="Today"
                value={`${site.todayAttendancePct ?? 0}%`}
                hint={`${site.todayPresent ?? 0} present`}
              />
            </div>

            <div className="mt-4 text-xs text-slate-500">
              <div className="font-medium text-slate-600 mb-1">Supervisors</div>
              {site.supervisors?.length ? (
                <div className="flex flex-wrap gap-1">
                  {site.supervisors.map((sup) => (
                    <span
                      key={sup._id}
                      className="px-2 py-0.5 bg-slate-100 rounded text-slate-600"
                    >
                      {sup.name}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="text-slate-400">None assigned</span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, hint }) {
  return (
    <div className="bg-slate-50 rounded-md p-2.5">
      <div className="text-xs text-slate-500 flex items-center gap-1">
        <Icon size={12} /> {label}
      </div>
      <div className="text-lg font-semibold text-slate-800 mt-0.5">{value}</div>
      {hint && <div className="text-xs text-slate-400">{hint}</div>}
    </div>
  );
}

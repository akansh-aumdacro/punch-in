import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { X, UploadCloud } from 'lucide-react';
import { workersApi } from '../../api/workers';
import { csvToObjects } from '../../utils/csv';

const REQUIRED = ['name', 'email', 'password'];
const KNOWN = [
  'name', 'email', 'password', 'employeeId', 'department',
  'category', 'site_id', 'shift_id', 'agency_id',
];

export default function BulkImportModal({ open, onClose }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null); // { headers, rows, errors }
  const [serverErrors, setServerErrors] = useState(null);
  const inputRef = useRef(null);
  const queryClient = useQueryClient();

  const importMutation = useMutation({
    mutationFn: (f) => workersApi.bulkImport(f),
    onSuccess: (data) => {
      toast.success(`Imported ${data.inserted} workers`);
      queryClient.invalidateQueries({ queryKey: ['workers'] });
      handleClose();
    },
    onError: (err) => {
      const body = err?.response?.data;
      if (body?.errors) setServerErrors(body);
      toast.error(body?.error || 'Import failed');
    },
  });

  function handleClose() {
    setFile(null);
    setPreview(null);
    setServerErrors(null);
    onClose();
  }

  async function handleFile(f) {
    if (!f) return;
    setFile(f);
    setServerErrors(null);
    const text = await f.text();
    const { headers, rows } = csvToObjects(text);

    const missing = REQUIRED.filter((c) => !headers.includes(c));
    const rowErrors = rows.map((row, i) => {
      const errs = [];
      if (!row.name || row.name.length < 2) errs.push('name required');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(row.email || '')) errs.push('email invalid');
      if (!row.password || row.password.length < 8) errs.push('password ≥ 8');
      return { row: i + 2, errs };
    });
    setPreview({ headers, rows, missing, rowErrors });
  }

  function onDrop(e) {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  }

  if (!open) return null;

  const previewHasErrors =
    preview && (preview.missing?.length || preview.rowErrors?.some((r) => r.errs.length));

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="text-lg font-semibold text-slate-800">Bulk Import Workers</h2>
          <button onClick={handleClose} className="text-slate-500 hover:text-slate-800">
            <X size={20} />
          </button>
        </div>

        <div className="p-5 overflow-y-auto">
          {!file && (
            <div
              onDrop={onDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => inputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 rounded-lg p-10 text-center cursor-pointer hover:border-slate-400 hover:bg-slate-50"
            >
              <UploadCloud className="mx-auto text-slate-400" size={36} />
              <p className="mt-2 text-sm text-slate-600">
                Drag &amp; drop a CSV file here, or click to browse
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Required columns: {REQUIRED.join(', ')}
              </p>
              <input
                ref={inputRef}
                type="file"
                accept=".csv,text/csv"
                hidden
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
            </div>
          )}

          {file && preview && (
            <>
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm text-slate-700">
                  <span className="font-medium">{file.name}</span>
                  <span className="text-slate-400 ml-2">
                    {preview.rows.length} rows
                  </span>
                </div>
                <button
                  onClick={() => {
                    setFile(null);
                    setPreview(null);
                  }}
                  className="text-xs text-slate-500 underline"
                >
                  Choose another
                </button>
              </div>

              {preview.missing?.length > 0 && (
                <div className="mb-3 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                  Missing required columns: {preview.missing.join(', ')}
                </div>
              )}

              <div className="overflow-x-auto border rounded-md">
                <table className="min-w-full text-xs">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-2 py-2 text-left">#</th>
                      {preview.headers.map((h) => (
                        <th key={h} className="px-2 py-2 text-left">
                          {h}
                          {!KNOWN.includes(h) && (
                            <span className="ml-1 text-amber-500" title="Unknown column">
                              ⚠
                            </span>
                          )}
                        </th>
                      ))}
                      <th className="px-2 py-2 text-left">Issues</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.slice(0, 50).map((r, i) => {
                      const errs = preview.rowErrors[i]?.errs || [];
                      return (
                        <tr
                          key={i}
                          className={errs.length ? 'bg-red-50' : 'border-t'}
                        >
                          <td className="px-2 py-1.5 text-slate-400">{i + 2}</td>
                          {preview.headers.map((h) => (
                            <td key={h} className="px-2 py-1.5 truncate max-w-[160px]">
                              {h === 'password' ? '••••' : r[h]}
                            </td>
                          ))}
                          <td className="px-2 py-1.5 text-red-600">
                            {errs.join(', ')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {preview.rows.length > 50 && (
                  <div className="text-xs text-slate-400 px-2 py-1.5 border-t">
                    Showing 50 of {preview.rows.length} rows…
                  </div>
                )}
              </div>

              {serverErrors && (
                <div className="mt-3 rounded-md bg-red-50 border border-red-200 p-3 text-sm">
                  <div className="font-medium text-red-700">
                    Server validation errors ({serverErrors.errors.length})
                  </div>
                  <ul className="mt-1 text-red-600 text-xs space-y-0.5 max-h-40 overflow-y-auto">
                    {serverErrors.errors.map((e) => (
                      <li key={e.row}>
                        Row {e.row} ({e.email}): {e.errors.join(', ')}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-5 py-4 border-t flex justify-end gap-2">
          <button
            onClick={handleClose}
            className="px-3 py-2 rounded-md text-sm border border-slate-300 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            disabled={!file || previewHasErrors || importMutation.isPending}
            onClick={() => importMutation.mutate(file)}
            className="px-3 py-2 rounded-md text-sm bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {importMutation.isPending ? 'Importing…' : 'Confirm Import'}
          </button>
        </div>
      </div>
    </div>
  );
}

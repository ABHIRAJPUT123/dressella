import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errMsg } from "@/lib/api";
import { AdminH1, Badge, Pager, statusTone } from "@/admin/AdminLayout";

export default function AdminExchanges() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin-exchanges", status, page],
    queryFn: () => api.get("/admin/exchanges", { params: { status, page } }).then((r) => r.data),
  });

  useEffect(() => () => { if (imageUrl) URL.revokeObjectURL(imageUrl); }, [imageUrl]);

  const review = async (requestId, nextStatus) => {
    if (!note.trim()) {
      toast.error("Add an admin note before reviewing this request.");
      return;
    }
    setBusy(true);
    try {
      await api.patch(`/admin/exchanges/${requestId}`, { status: nextStatus, admin_note: note.trim() });
      toast.success(`Request ${nextStatus}`);
      setSelected("");
      setNote("");
      await queryClient.invalidateQueries({ queryKey: ["admin-exchanges"] });
      await queryClient.invalidateQueries({ queryKey: ["my-exchanges"] });
    } catch (error) {
      toast.error(errMsg(error));
    } finally {
      setBusy(false);
    }
  };

  const showImage = async (requestId) => {
    try {
      const { data: blob } = await api.get(`/admin/exchanges/${requestId}/image`, { responseType: "blob" });
      setImageUrl(URL.createObjectURL(blob));
    } catch (error) {
      toast.error(errMsg(error, "The attachment could not be loaded."));
    }
  };

  return (
    <div data-testid="admin-exchanges">
      <AdminH1>Return & exchange requests</AdminH1>
      <p className="mb-6 max-w-3xl text-sm leading-relaxed text-taupe">Review customer-submitted requests. Approval is not fulfillment: coordinate item inspection, pickup/shipping, and replacement availability manually. This dashboard does not create orders, reserve stock, or issue refunds.</p>
      <div className="mb-5 flex flex-wrap gap-3">
        <select className="input-luxe h-10 w-56 bg-ivory" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} aria-label="Filter exchange requests by status">
          <option value="">All statuses</option><option value="submitted">Submitted</option><option value="approved">Approved</option><option value="rejected">Rejected</option>
        </select>
      </div>
      {isLoading && <div className="h-40 animate-pulse bg-linen" aria-busy="true" />}
      {isError && <p role="alert" className="border border-line bg-ivory p-5 text-sm text-destructive">Exchange requests could not be loaded. Refresh and try again.</p>}
      {!isLoading && !isError && !data?.items?.length && <p className="border border-line bg-ivory p-6 text-sm text-taupe">No exchange requests match this filter.</p>}
      {!!data?.items?.length && <div className="overflow-x-auto border border-line bg-ivory">
        <table className="w-full min-w-[950px] text-left text-sm">
          <thead className="border-b border-line text-[11px] uppercase tracking-[0.14em] text-taupe">
            <tr><th className="p-3">Request / order</th><th>Date</th><th>Customer</th><th>Item</th><th>Reason</th><th>Replacement</th><th>Status</th><th>Review</th></tr>
          </thead>
          <tbody>
            {data.items.map((request) => (
              <tr key={request.request_id} className="border-b border-line align-top last:border-0" data-testid={`admin-exchange-${request.request_id}`}>
                <td className="p-3"><button className="font-semibold underline" onClick={() => setSelected(selected === request.request_id ? "" : request.request_id)}>{request.request_id}</button><p className="mt-1 text-xs text-taupe">{request.order_number}</p></td>
                <td className="whitespace-nowrap pt-4">{new Date(request.created_at).toLocaleDateString("en-IN")}</td>
                <td className="pt-4">{request.customer?.name}<p className="text-xs text-taupe">{request.customer?.email}</p></td>
                <td className="pt-4">{request.item.title}<p className="text-xs text-taupe">{request.item.color} · {request.item.size} × {request.item.qty}</p></td>
                <td className="pt-4">{request.reason}</td>
                <td className="pt-4">{request.replacement.title}<p className="text-xs text-taupe">{request.replacement.color} · {request.replacement.size}</p></td>
                <td className="pt-4"><Badge tone={statusTone(request.status)}>{request.status}</Badge></td>
                <td className="pt-4">
                  {request.status === "submitted"
                    ? <button className="text-xs underline" onClick={() => { setSelected(request.request_id); setNote(""); }}>Review</button>
                    : <span className="text-xs text-taupe">Reviewed</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>}
      {data && <Pager page={data.page} pages={data.pages} setPage={setPage} />}
      {selected && data?.items?.find((item) => item.request_id === selected) && (
        <section className="mt-6 border border-line bg-ivory p-5 sm:p-7" aria-label="Review exchange request">
          {(() => {
            const request = data.items.find((item) => item.request_id === selected);
            return <>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div><p className="eyebrow">{request.request_id}</p><h2 className="mt-2 font-serif text-2xl">{request.item.title} · {request.item.size}</h2><p className="mt-2 text-sm text-taupe">Customer comments: {request.comments || "None provided"}</p></div>
                <button className="text-sm underline" onClick={() => setSelected("")}>Close</button>
              </div>
              {request.image_attached && <button className="mt-4 text-sm underline" onClick={() => showImage(request.request_id)}>View customer photo</button>}
              {imageUrl && <img src={imageUrl} alt="Customer exchange evidence" className="mt-4 max-h-80 max-w-full object-contain" />}
              {request.status === "submitted" && <>
                <label className="mt-5 block"><span className="label-luxe">Admin note (required)</span><textarea rows={3} maxLength={1000} className="input-luxe h-auto py-3" value={note} onChange={(event) => setNote(event.target.value)} /></label>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button className="btn-primary" disabled={busy || !note.trim()} onClick={() => review(request.request_id, "approved")}>{busy ? "Saving…" : "Approve request"}</button>
                  <button className="btn-outline" disabled={busy || !note.trim()} onClick={() => review(request.request_id, "rejected")}>Reject request</button>
                </div>
              </>}
              {request.admin_note && <p className="mt-4 border-l-2 border-line pl-3 text-sm">Previous admin note: {request.admin_note}</p>}
            </>;
          })()}
        </section>
      )}
    </div>
  );
}

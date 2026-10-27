import { ConfirmButton } from "@/components/Confirm";
import { deleteRequest } from "./actions";

/** For portal admins, at the foot of a request page: delete it for good. */
export function DeleteRequest({ id, what }: { id: string; what?: string }) {
  return (
    <form action={deleteRequest} className="row end">
      <input type="hidden" name="id" value={id} />
      <ConfirmButton
        variant="quiet"
        danger
        size="small"
        title={`Delete ${id}?`}
        message={<>This removes the request and its notifications for everyone. It can&apos;t be undone.{what ? ` ${what}` : ""} Files already in Google Drive stay there.</>}
        confirmLabel="Delete for good"
      >
        Delete request (admin)
      </ConfirmButton>
    </form>
  );
}

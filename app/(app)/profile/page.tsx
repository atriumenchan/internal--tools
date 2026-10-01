"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, ErrorText, Field, Input, PageHeader } from "@/components/ui";
import { PageFallback } from "@/components/app-nav";
import { FileDrop } from "@/components/file-drop";
import { Avatar } from "@/components/avatar";
import { useAppState } from "@/components/app-frame";
import { avatarSrc } from "@/lib/avatar";
import { displayName } from "@/lib/spaces";
import { WORKSPACE_ROLE_LABELS, workspaceRole } from "@/lib/roles";
import { isAdminUser } from "@/lib/admin";

export default function ProfilePage() {
  const app = useAppState();
  const [photo, setPhoto] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!app) return;
    setNameDraft(app.profile.full_name || "");
    setPhoto(app.profile.avatar_url ?? null);
  }, [app]);

  if (!app) return <PageFallback />;

  const me = { ...app.profile, avatar_url: photo };
  const admin = isAdminUser({ email: app.profile.email, role: app.profile.role });

  async function uploadPhoto(file: File) {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/profile-image", { method: "POST", body: form });
      const json = (await res.json()) as { avatar_url?: string; error?: string };
      if (!res.ok) {
        setError(json.error || "Could not save the photo.");
        return;
      }
      setPhoto(json.avatar_url ?? null);
    } finally {
      setBusy(false);
    }
  }

  async function removePhoto() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/profile-image", { method: "DELETE" });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        setError(json.error || "Could not remove the photo.");
        return;
      }
      setPhoto(null);
    } finally {
      setBusy(false);
    }
  }

  async function saveName() {
    if (!app) return;
    const full_name = nameDraft.trim();
    if (!full_name) {
      setError("Your name cannot be empty.");
      return;
    }
    setSaving(true);
    setError(null);
    const { error: err } = await createClient().from("profiles").update({ full_name }).eq("id", app.userId);
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    setSaved(true);
  }

  return (
    <div>
      <PageHeader
        title="Profile"
        description="Your photo and name. Everyone sees these on tasks, chat, and boards."
      />
      <ErrorText className="mb-4">{error}</ErrorText>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="font-display text-xl font-medium tracking-tight">Photo</h2>
          <p className="mt-1 mb-4 text-sm text-muted">JPG, PNG, WebP, or GIF, up to 3 MB.</p>
          <div className="flex items-center gap-4">
            <Avatar
              name={displayName(me)}
              src={avatarSrc(me)}
              className="h-20 w-20 text-[22px]"
            />
            <div className="min-w-0 flex-1">
              <FileDrop
                onFile={(file) => void uploadPhoto(file)}
                accept="image/*"
                label={busy ? "Saving…" : photo ? "Change photo" : "Add your photo"}
                hint="Drop an image or click to pick one."
              />
            </div>
          </div>
          {photo ? (
            <Button type="button" variant="ghost" size="sm" className="mt-3" disabled={busy} onClick={() => void removePhoto()}>
              Remove photo
            </Button>
          ) : null}
        </Card>

        <Card>
          <h2 className="font-display text-xl font-medium tracking-tight">Details</h2>
          <p className="mt-1 mb-4 text-sm text-muted">
            {admin ? "Your login lives in Vercel." : "Ryan Ritabrata changes email IDs and passwords on Staff."}
          </p>
          <Field label="Name">
            <Input
              value={nameDraft}
              onChange={(e) => {
                setSaved(false);
                setNameDraft(e.target.value);
              }}
            />
          </Field>
          <div className="mt-4">
            <Field label="Email ID">
              <Input value={app.profile.email} readOnly disabled />
            </Field>
          </div>
          <div className="mt-4">
            <Field label="Access level">
              <Input value={WORKSPACE_ROLE_LABELS[workspaceRole(app.profile)]} readOnly disabled />
            </Field>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <Button type="button" onClick={() => void saveName()} disabled={saving || !nameDraft.trim()}>
              {saving ? "Saving…" : "Save"}
            </Button>
            {saved ? <p className="text-[13px] font-medium text-teal">Saved</p> : null}
          </div>
        </Card>
      </div>
    </div>
  );
}

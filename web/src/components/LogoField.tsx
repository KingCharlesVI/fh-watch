import { TextField } from "@/components/TextField";

/** Picks a club logo for the admin forms; their actions read it as `logo`. */
export function LogoField({ label = "Logo", hint }: { label?: string; hint?: string }) {
  return (
    <TextField
      label={label}
      hint={hint ?? "PNG, JPEG or WebP, up to 512 KB. Without one, the club's initials show."}
      name="logo"
      type="file"
      accept="image/png,image/jpeg,image/webp"
    />
  );
}

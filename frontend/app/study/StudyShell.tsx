"use client";

import { useSearchParams } from "next/navigation";
import { type ReactElement } from "react";

import { StudyWorkspace } from "@/components/StudyWorkspace";

export function StudyShell(): ReactElement {
  const searchParams = useSearchParams();
  const v = searchParams.get("v");

  return <StudyWorkspace initialVideoId={v} showLibraryLink />;
}

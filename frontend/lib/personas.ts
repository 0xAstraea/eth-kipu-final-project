"use client";

import { useLocalValue } from "@/lib/use-local-list";
import type { Persona, PersonaRole } from "@/lib/types";
import { useCallback, useEffect, useMemo } from "react";

export const PERSONAS_KEY = "teamup-zk-personas";

export type PersonasState = {
  personas: Persona[];
  activeId: string;
};

export const DEFAULT_PERSONAS: Persona[] = [
  { id: "professor", name: "Professor", role: "professor" },
  { id: "alumn-1", name: "Alumn 1", role: "student" },
  { id: "alumn-2", name: "Alumn 2", role: "student" },
  { id: "alumn-3", name: "Alumn 3", role: "student" }
];

function seed(): PersonasState {
  return { personas: DEFAULT_PERSONAS, activeId: DEFAULT_PERSONAS[0].id };
}

/** Next free "Alumn N" label, so adding a persona never reuses a visible name. */
function nextStudentName(personas: Persona[]): string {
  const used = new Set(
    personas.filter((p) => p.role === "student").map((p) => Number(p.name.replace(/\D+/g, "")) || 0)
  );
  let n = 1;
  while (used.has(n)) n += 1;
  return `Alumn ${n}`;
}

export type PersonasApi = {
  personas: Persona[];
  activeId: string;
  active: Persona;
  setActive: (id: string) => void;
  addPersona: (role?: PersonaRole) => void;
  renamePersona: (id: string, name: string) => void;
  removePersona: (id: string) => void;
  setWallet: (id: string, wallet: string | undefined) => void;
};

/**
 * Personas split the browser state into the actors of the demo: the professor who
 * enrolls students, and each student who applies to teams with their own identity.
 * The first read seeds the default cast; the rest of the state is persisted.
 */
export function usePersonas(): PersonasApi {
  const { value, set } = useLocalValue<PersonasState>(PERSONAS_KEY);

  useEffect(() => {
    if (!value) set(seed());
  }, [value, set]);

  const personas = value?.personas ?? DEFAULT_PERSONAS;
  const activeId = value?.activeId ?? DEFAULT_PERSONAS[0].id;

  const update = useCallback(
    (mutate: (current: PersonasState) => PersonasState) => {
      set(mutate(value ?? seed()));
    },
    [set, value]
  );

  const setActive = useCallback(
    (id: string) => update((state) => ({ ...state, activeId: id })),
    [update]
  );

  const addPersona = useCallback(
    (role: PersonaRole = "student") =>
      update((state) => {
        const persona: Persona = {
          id: crypto.randomUUID(),
          name: role === "professor" ? `Professor ${state.personas.length}` : nextStudentName(state.personas),
          role
        };
        return { personas: [...state.personas, persona], activeId: persona.id };
      }),
    [update]
  );

  const renamePersona = useCallback(
    (id: string, name: string) =>
      update((state) => ({
        ...state,
        personas: state.personas.map((persona) =>
          persona.id === id ? { ...persona, name: name.trim() || persona.name } : persona
        )
      })),
    [update]
  );

  const removePersona = useCallback(
    (id: string) =>
      update((state) => {
        const target = state.personas.find((persona) => persona.id === id);
        // The professor role is part of the protocol, so it always keeps one persona.
        if (!target || (target.role === "professor" && state.personas.filter((p) => p.role === "professor").length <= 1)) {
          return state;
        }
        const personas = state.personas.filter((persona) => persona.id !== id);
        const activeId = state.activeId === id ? personas[0]?.id ?? "" : state.activeId;
        return { personas, activeId };
      }),
    [update]
  );

  const setWallet = useCallback(
    (id: string, wallet: string | undefined) =>
      update((state) => ({
        ...state,
        personas: state.personas.map((persona) => (persona.id === id ? { ...persona, wallet } : persona))
      })),
    [update]
  );

  const active = useMemo(
    () => personas.find((persona) => persona.id === activeId) ?? personas[0] ?? DEFAULT_PERSONAS[0],
    [personas, activeId]
  );

  return { personas, activeId, active, setActive, addPersona, renamePersona, removePersona, setWallet };
}

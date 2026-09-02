export type CapabilityState = "AVAILABLE" | "NOT_CONFIGURED" | "NOT_SUPPORTED" | "REQUIRES_APPROVAL" | "BETA";

export function capabilityLabel(state: CapabilityState) {
  switch (state) {
    case "AVAILABLE":
      return "Disponível";
    case "NOT_CONFIGURED":
      return "Aguardando credenciais";
    case "NOT_SUPPORTED":
      return "Não suportado pela API oficial";
    case "REQUIRES_APPROVAL":
      return "Requer aprovação da plataforma";
    case "BETA":
      return "Beta";
  }
}

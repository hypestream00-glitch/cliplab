import { z } from "zod";

export const signUpSchema = z
  .object({
    name: z.string().min(2, "Informe seu nome").max(80),
    email: z.string().email("E-mail inválido"),
    password: z
      .string()
      .min(8, "Mínimo de 8 caracteres")
      .regex(/[A-Za-z]/, "Inclua ao menos uma letra")
      .regex(/[0-9]/, "Inclua ao menos um número"),
    confirmPassword: z.string().min(8, "Confirme a senha"),
    terms: z.literal(true, { errorMap: () => ({ message: "Aceite os Termos de Uso e a Política de Privacidade." }) }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "As senhas não coincidem.",
    path: ["confirmPassword"],
  });

export const loginSchema = z.object({
  email: z.string().email("E-mail inválido"),
  password: z.string().min(1, "Informe a senha"),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email("E-mail inválido"),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(10),
  password: z.string().min(8, "Mínimo de 8 caracteres"),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Informe a senha atual"),
    password: z
      .string()
      .min(8, "Mínimo de 8 caracteres")
      .regex(/[A-Za-z]/, "Inclua ao menos uma letra")
      .regex(/[0-9]/, "Inclua ao menos um número"),
    confirmPassword: z.string().min(8, "Confirme a senha"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "As senhas não coincidem.",
    path: ["confirmPassword"],
  });

export const createProjectSchema = z.object({
  name: z.string().min(2).max(120),
  sourceKind: z.enum(["UPLOAD", "YOUTUBE", "TWITCH", "KICK", "GOOGLE_DRIVE", "DIRECT_URL"]),
  sourceUrl: z.string().url().optional().or(z.literal("")),
  language: z.string().default("pt-BR"),
  outputAspect: z.enum(["9:16", "1:1", "16:9"]).default("9:16"),
  intervalSeconds: z.coerce.number().int().min(0).max(600),
  clipDuration: z.enum(["15-30", "30-60", "60-90", "90+"]),
  clipCount: z.coerce.number().int().min(1).max(40),
  mode: z.enum(["AUTOMATIC", "VIRAL", "PODCAST", "GAMING", "HIGHLIGHTS", "HUMOR", "INFORMATIVE"]),
  detectSpeakers: z.coerce.boolean(),
  removeSilences: z.coerce.boolean(),
  autoReframe: z.coerce.boolean(),
  autoCaptions: z.coerce.boolean(),
  viralScore: z.coerce.boolean(),
  generateTitle: z.coerce.boolean(),
  generateDescription: z.coerce.boolean(),
  generateHashtags: z.coerce.boolean(),
  authorized: z.literal(true, { errorMap: () => ({ message: "Confirme a autorização de uso." }) }),
});

export const publishSchema = z.object({
  clipId: z.string(),
  accountIds: z.array(z.string()).min(1),
  caption: z.string().max(2200).optional(),
  hashtags: z.array(z.string()).optional(),
  mode: z.enum(["now", "schedule", "queue"]),
  scheduledFor: z.string().datetime().optional(),
  timezone: z.string().default("America/Sao_Paulo"),
  tiktok: z
    .object({
      privacy: z.enum(["PUBLIC", "FRIENDS", "PRIVATE"]).optional(),
      allowComments: z.boolean().optional(),
      allowDuet: z.boolean().optional(),
      allowStitch: z.boolean().optional(),
    })
    .optional(),
  youtube: z
    .object({
      title: z.string().max(100).optional(),
      description: z.string().max(5000).optional(),
      visibility: z.enum(["public", "unlisted", "private"]).optional(),
      madeForKids: z.boolean().optional(),
    })
    .optional(),
});

import type { AdvisorAIProvider, AdvisorProviderInput } from "../provider.server";
import { VIORA_ADVISOR_MODEL } from "../config.server";

function mockResponseId(advisorId: AdvisorProviderInput["request"]["advisor_id"]): string {
  return `mock_${advisorId}_${crypto.randomUUID()}`;
}

function quoteMessage(message: string): string {
  const compact = message.replace(/\s+/g, " ").trim();
  return compact.length > 180 ? `${compact.slice(0, 177)}...` : compact;
}

function createMockText({ advisor, request }: AdvisorProviderInput): string {
  const message = quoteMessage(request.message);

  switch (advisor.id) {
    case "adam":
      return `שמעתי אותך: „${message}”\n\nכדאי להתחיל בצעד התאוששות אחד שקל לבצע היום: להוריד מעט עומס, לשתות מים ולתכנן שעת שינה עקבית. אם יש כאב חריג, החמרה או תסמין מדאיג, עדיף לעצור ולפנות לאיש מקצוע מתאים.\n\nהמטרה היא שיפור רגוע ובר־קיימא, לא שגרה מושלמת ביום אחד.`;
    case "daniel":
      return `קיבלתי: „${message}”\n\nלאימון כוח קצר בחר 3 תרגילים מרכזיים: תרגיל רגליים, דחיפה ומשיכה. בצע 3 סטים של 6–10 חזרות לכל תרגיל, עם טכניקה נקייה ומנוחה של 60–90 שניות.\n\nשמור 1–3 חזרות ברזרבה. אם הטכניקה נשברת, הורד משקל לפני שאתה מוסיף עוד עומס.`;
    case "maya":
      return `הבנתי: „${message}”\n\nבואי נבחר פעילות שקל להתחיל: 15–20 דקות הליכה מהירה, ריצה קלה או אירובי שאת נהנית ממנו. אפשר לפצל לשני מקטעים קצרים אם היום עמוס.\n\nהיעד הוא להכניס תנועה ליום ולבנות רצף שאפשר לחזור עליו.`;
    case "shiran":
      return `הבנתי: „${message}”\n\nבחרי ארוחה פשוטה עם מקור חלבון, ירק ופחמימה שמתאימה למה שכבר יש בבית. למשל יוגורט ופרי, חביתה וסלט, או קערת אורז עם קטניות וירקות.\n\nאין צורך במנה מושלמת—עדיף פתרון טעים, מעשי ומשביע שאפשר להתמיד בו.`;
  }
}

export const mockAdvisorProvider: AdvisorAIProvider = {
  async generate(input) {
    return {
      advisor_id: input.request.advisor_id,
      conversation_id: input.request.conversation_id,
      response_id: mockResponseId(input.request.advisor_id),
      text: createMockText(input),
      provider_metadata: { provider: "mock", model: VIORA_ADVISOR_MODEL },
    };
  },
};

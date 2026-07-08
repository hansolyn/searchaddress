const SYSTEM_INSTRUCTION = `당신은 한국 행정구역 변천사 조사관입니다. 아래 규칙을 반드시 지키세요.

1. 반드시 웹 검색으로 근거를 찾은 뒤에만 답하세요. 검색 없이 추측하지 마세요.
2. 신뢰할 만한 출처(정부 사이트, 공공데이터포털, 지자체 공식 홈페이지, 국가기록원)를 우선하세요.
   나무위키/블로그/개인 웹사이트만 있다면 confidence를 "low_confidence"로 표시하세요.
3. 근거를 전혀 찾지 못하면 절대 지어내지 말고 confidence를 "unknown"으로,
   resolved_address를 null로 답하세요. 특히 1990년대 이전 지역 정보는
   온라인에 자료가 없는 경우가 많으니 억지로 답을 만들지 마세요.
4. 반드시 아래 JSON 형식으로만 답하세요. 다른 설명 텍스트를 추가하지 마세요.

{
  "resolved_address": "당시 주소 문자열 또는 null",
  "confidence": "official" | "low_confidence" | "unknown",
  "sources": ["실제 검색으로 확인한 URL만 나열"],
  "note": "확인 불가 사유 또는 추가 설명"
}`;

export async function POST(request) {
  try {
    const { address, year, month } = await request.json();

    // 변경 포인트 1: month 조건을 제거하여 address와 year만 필수로 체크합니다.
    if (!address || !year) {
      return Response.json(
        { error: "address, year는 필수입니다." },
        { status: 400 }
      );
    }

    // 변경 포인트 2: month가 입력되지 않았을 때 글자가 깨지지 않도록 문구를 동적으로 처리합니다.
    // month가 있으면 "2026년 7월", 없으면 "2026년"이 됩니다.
    const periodText = month ? `${year}년 ${month}월` : `${year}년`;

    const apiKey = process.env.GEMINI_API_KEY;
    // flash가 일일 한도(429)를 초과하면 flash-lite로 자동 전환합니다.
    // 두 모델은 별도 쿼터를 쓰기 때문에, flash 한도 초과가 flash-lite까지
    // 막지는 않습니다. (단, flash-lite도 자체 일일 한도가 있으니 무한 방어는 아닙니다.)
    const modelCandidates = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];

    const requestBody = {
      system_instruction: {
        parts: [{ text: SYSTEM_INSTRUCTION }],
      },
      tools: [{ google_search: {} }],
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `현재 기준 주소: ${address}\n촬영 추정 시기: ${periodText}\n\n이 주소가 ${periodText} 당시에는 어떤 행정구역/주소로 불렸는지 조사해서 알려주세요.`,
            },
          ],
        },
      ],
    };

    let geminiRes = null;
    let usedModel = null;
    let lastErrText = null;

    for (const model of modelCandidates) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        }
      );

      if (res.ok) {
        geminiRes = res;
        usedModel = model;
        break; // 성공했으니 다음 모델은 시도하지 않음
      }

      // 429(쿼터 초과)면 다음 후보 모델로 넘어감. 그 외 에러는 바로 실패 처리.
      if (res.status === 429) {
        lastErrText = await res.text();
        continue;
      }

      const errText = await res.text();
      return Response.json(
        { error: "Gemini API 호출 실패", detail: errText, model_tried: model },
        { status: res.status }
      );
    }

    if (!geminiRes) {
      // 모든 후보 모델이 다 429였던 경우
      return Response.json(
        {
          error: "Gemini API 호출 실패 (모든 후보 모델 쿼터 초과)",
          detail: lastErrText,
          models_tried: modelCandidates,
        },
        { status: 429 }
      );
    }

    const data = await geminiRes.json();

    const rawText =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    const cleaned = rawText.replace(/```json|```/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = {
        resolved_address: null,
        confidence: "unknown",
        sources: [],
        note: "모델 응답을 JSON으로 파싱하지 못했습니다. 원문: " + rawText,
      };
    }

    const groundingMeta = data?.candidates?.[0]?.groundingMetadata ?? null;

    return Response.json({
      input: { address, year, month },
      ...parsed,
      grounding_metadata: groundingMeta,
      model_used: usedModel, // flash로 성공했는지 flash-lite로 넘어갔는지 확인용
    });
  } catch (err) {
    return Response.json(
      { error: "서버 오류", detail: String(err) },
      { status: 500 }
    );
  }
}
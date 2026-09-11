export interface VerificationInput {
  workflowId: string;
  resend?: boolean;
}
type WorkflowBody = {
  route?: {
    exit?: { status?: string };
    replace?: {
      screen?: {
        name?: string;
        blockId?: string;
        deviceApprovalChallengeScreenParams?: {
          identiFrameworkEnabled?: boolean;
          sheriffChallenge?: { id?: string };
        };
      };
    };
  };
  deviceApprovalChallengeActionResponse?: Record<string, unknown>;
  status?: string;
};
/** Executes only the observed identity workflow, under the original CLI session.
 * It never approves a challenge itself, submits a transfer, or changes credentials.
 */
export async function advanceMoneyMovementVerification(input: VerificationInput) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.workflowId))
    throw new Error("Invalid workflow ID");
  const token = process.env.ROBINHOOD_BROKERAGE_TOKEN;
  if (!token) throw new Error("Original brokerage session token required");
  const request = async (url: string, method: string, body?: unknown) => {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    };
    if (body) headers["Content-Type"] = "application/json";
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30000),
    });
    const data = (await response.json()) as WorkflowBody;
    if (!response.ok)
      throw new Error(`Verification request ${response.status}: ${JSON.stringify(data)}`);
    return data;
  };
  const url = `https://identi.robinhood.com/idl/v1/workflow/${input.workflowId}/`;
  const base = { id: input.workflowId, clientVersion: "1.0.0" };
  const entry = await request(url, "PATCH", { ...base, entryPointAction: {} });
  if (entry.route?.exit)
    return {
      workflowId: input.workflowId,
      status: entry.route.exit.status,
      approved: entry.route.exit.status === "WORKFLOW_STATUS_APPROVED",
      submitted: false,
    };
  const screen = entry.route?.replace?.screen;
  if (screen?.name !== "DEVICE_APPROVAL_CHALLENGE")
    return {
      workflowId: input.workflowId,
      approved: false,
      submitted: false,
      status: "action_required",
      screen,
    };
  const params = screen.deviceApprovalChallengeScreenParams;
  const action = (name: string) =>
    request(url, "PATCH", {
      ...base,
      screenName: screen.name,
      blockId: screen.blockId,
      deviceApprovalChallengeAction: { [name]: {} },
    });
  if (input.resend) await action("resend");
  let status: string;
  if (params?.identiFrameworkEnabled) {
    const result = await action("checkStatus");
    status = Object.keys(result.deviceApprovalChallengeActionResponse ?? {})[0] ?? "unknown";
  } else if (params?.sheriffChallenge?.id) {
    const result = await request(
      `https://api.robinhood.com/challenge/${params.sheriffChallenge.id}/`,
      "GET",
    );
    status = String(result.status ?? "unknown");
  } else
    return {
      workflowId: input.workflowId,
      approved: false,
      submitted: false,
      status: "not_evaluated",
      missing: "challenge identity",
    };
  if (["validated", "redeemed", "approved"].includes(status.toLowerCase())) {
    const result = await action("proceed");
    const exit = result.route?.exit;
    return {
      workflowId: input.workflowId,
      approved: exit?.status === "WORKFLOW_STATUS_APPROVED",
      submitted: false,
      status: exit?.status ?? "action_required",
      screen: result.route?.replace?.screen,
    };
  }
  return {
    workflowId: input.workflowId,
    approved: false,
    submitted: false,
    status,
    userAction: {
      type: "approve_on_phone",
      message:
        "Open Robinhood on your phone and approve this verification notification. This action does not submit the transfer.",
    },
  };
}

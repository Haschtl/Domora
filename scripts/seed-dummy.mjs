import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  buildCompletionRows,
  buildEventRows,
  buildFinanceRows,
  buildMemberRows,
  buildPimperRows,
  buildShoppingCompletionRows,
  buildShoppingRows,
  buildRotationRows,
  buildTaskRows,
  buildCashAuditRows,
  buildBucketRows,
  buildBucketVoteRows,
  buildSubscriptionRows,
  buildTaskCompletionRatingRows,
  memberColors,
  memberProfiles,
  randomCode,
  toInt
} from "./seed-dummy-data.mjs";

const parseEnvFile = (filePath) => {
  try {
    const raw = readFileSync(filePath, "utf8");
    const lines = raw.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separator = trimmed.indexOf("=");
      if (separator <= 0) continue;
      const key = trimmed.slice(0, separator).trim();
      const value = trimmed.slice(separator + 1).trim().replace(/^"|"$/g, "");
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // ignore missing env files
  }
};

parseEnvFile(resolve(process.cwd(), ".env"));
parseEnvFile(resolve(process.cwd(), ".env.local"));

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseSecretKey) {
  console.error("Missing env vars. Required:");
  console.error("- SUPABASE_URL (or VITE_SUPABASE_URL)");
  console.error("- SUPABASE_SECRET_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseSecretKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const memberCount = toInt(process.env.DUMMY_MEMBER_COUNT, 5);
const financeCount = toInt(process.env.DUMMY_FINANCE_COUNT, 72);
const taskCount = toInt(process.env.DUMMY_TASK_COUNT, 14);
const shoppingCount = toInt(process.env.DUMMY_SHOPPING_COUNT, 48);
const cashAuditCount = toInt(process.env.DUMMY_CASH_AUDIT_COUNT, 5);

const now = new Date();
const runId = `${now.getTime().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const appTablesToClear = [
  { table: "cash_audit_requests", markerColumn: "id" },
  { table: "finance_subscriptions", markerColumn: "id" },
  { table: "finance_entries", markerColumn: "id" },
  { table: "household_events", markerColumn: "id" },
  { table: "task_completion_ratings", markerColumn: "task_completion_id" },
  { table: "task_completions", markerColumn: "id" },
  { table: "task_rotation_members", markerColumn: "task_id" },
  { table: "tasks", markerColumn: "id" },
  { table: "bucket_item_date_votes", markerColumn: "bucket_item_id" },
  { table: "bucket_items", markerColumn: "id" },
  { table: "shopping_item_completions", markerColumn: "id" },
  { table: "shopping_items", markerColumn: "id" },
  { table: "household_member_pimpers", markerColumn: "household_id" },
  { table: "household_members", markerColumn: "household_id" },
  { table: "households", markerColumn: "id" },
  { table: "user_profiles", markerColumn: "user_id" }
];

const clearApplicationData = async () => {
  console.warn("WARNING: This will clear existing Domora data before inserting new dummy data.");
  console.warn("WARNING: Tables affected: cash_audit_requests, finance_subscriptions, finance_entries, household_events, tasks, shopping_items, bucket_items, households, user_profiles, ...");
  console.warn("WARNING: Continuing in 3 seconds. Press Ctrl+C to abort.");
  await new Promise((resolveTimeout) => setTimeout(resolveTimeout, 3000));

  for (const entry of appTablesToClear) {
    const { error } = await supabase
      .from(entry.table)
      .delete()
      .not(entry.markerColumn, "is", null);

    if (error) {
      throw new Error(`Failed to clear ${entry.table}: ${error.message}`);
    }
  }
};

const clearDemoAuthUsers = async () => {
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage
    });

    if (error) {
      throw new Error(`Failed to list existing auth users: ${error.message}`);
    }

    const users = data?.users ?? [];
    const targetUsers = users.filter((user) => {
      const email = String(user.email ?? "").toLowerCase();
      return email.startsWith("domora+") && email.endsWith("@example.com");
    });

    for (const user of targetUsers) {
      const { error: deleteError } = await supabase.auth.admin.deleteUser(user.id);
      if (deleteError) {
        throw new Error(`Failed to delete demo auth user ${user.email ?? user.id}: ${deleteError.message}`);
      }
    }

    if (users.length < perPage) break;
    page += 1;
  }
};

const createUsers = async () => {
  const users = [];

  for (let i = 0; i < memberCount; i += 1) {
    const profile = memberProfiles[i % memberProfiles.length];
    const name = profile.displayName;
    const email = `domora+${runId}+${i + 1}@example.com`;

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password: "DomoraDemo123!",
      email_confirm: true,
      user_metadata: {
        display_name: name
      }
    });

    if (error) {
      throw new Error(`Failed to create user ${email}: ${error.message}`);
    }

    users.push({
      id: data.user.id,
      email,
      name
    });
  }

  return users;
};

const run = async () => {
  await clearApplicationData();
  await clearDemoAuthUsers();

  console.log(`Seeding dummy data (run: ${runId}) ...`);
  const users = await createUsers();
  const owner = users[0];
  const inviteCode = randomCode(8);

  const { data: household, error: householdError } = await supabase
    .from("households")
    .insert({
      name: `Domora Demo WG ${runId.slice(-4).toUpperCase()}`,
      image_url: null,
      address: "Musterstrasse 12, 1010 Wien",
      currency: "EUR",
      apartment_size_sqm: 103.5,
      cold_rent_monthly: 1690,
      utilities_monthly: 400,
      landing_page_markdown: [
        "# Willkommen in der Demo-WG",
        "",
        "Dies ist eine automatisch erzeugte Landing Page mit Widgets.",
        "",
        "{{widget:tasks-for-you}}",
        "",
        "{{widget:bucket-short-list}}",
        "",
        "{{widget:recent-activity}}"
      ].join("\n"),
      invite_code: inviteCode,
      created_by: owner.id
    })
    .select("id, name, invite_code")
    .single();

  if (householdError) {
    throw new Error(`Failed to create household: ${householdError.message}`);
  }

  const householdId = household.id;

  const memberRows = buildMemberRows({ householdId, users });

  const { error: memberError } = await supabase.from("household_members").insert(memberRows);
  if (memberError) {
    throw new Error(`Failed to insert household members: ${memberError.message}`);
  }

  const profileRows = users.map((user, index) => ({
    user_id: user.id,
    display_name: user.name,
    avatar_url: null,
    user_color: memberColors[index % memberColors.length] ?? "#0ea5e9",
    paypal_name: user.email.split("@")[0],
    revolut_name: user.email.split("@")[0],
    wero_name: user.name
  }));
  const { error: profileError } = await supabase.from("user_profiles").upsert(profileRows);
  if (profileError) {
    throw new Error(`Failed to upsert user profiles: ${profileError.message}`);
  }

  const subscriptionRows = buildSubscriptionRows({
    householdId,
    ownerId: owner.id,
    users,
    now
  });
  const { error: subscriptionError } = await supabase.from("finance_subscriptions").insert(subscriptionRows);
  if (subscriptionError) {
    throw new Error(`Failed to insert finance subscriptions: ${subscriptionError.message}`);
  }

  const taskRows = buildTaskRows({
    taskCount,
    users,
    householdId,
    ownerId: owner.id,
    now
  });

  const { data: insertedTasks, error: taskError } = await supabase
    .from("tasks")
    .insert(taskRows)
    .select("id, title, done, done_by, effort_pimpers, due_at, frequency_days, assignee_id");

  if (taskError) {
    throw new Error(`Failed to insert tasks: ${taskError.message}`);
  }

  const rotationRows = buildRotationRows({ insertedTasks, users });

  const { error: rotationError } = await supabase.from("task_rotation_members").insert(rotationRows);
  if (rotationError) {
    throw new Error(`Failed to insert task rotations: ${rotationError.message}`);
  }

  const completionRows = buildCompletionRows({ insertedTasks, householdId });
  let insertedCompletionRows = [];

  if (completionRows.length > 0) {
    const { data, error: completionError } = await supabase
      .from("task_completions")
      .insert(completionRows)
      .select("id, task_id, user_id, completed_at");
    if (completionError) {
      throw new Error(`Failed to insert task completions: ${completionError.message}`);
    }
    insertedCompletionRows = data ?? [];
  }

  const completionRatingRows = buildTaskCompletionRatingRows({
    insertedCompletionRows,
    users,
    householdId
  });

  if (completionRatingRows.length > 0) {
    const { error: completionRatingError } = await supabase
      .from("task_completion_ratings")
      .insert(completionRatingRows);
    if (completionRatingError) {
      throw new Error(`Failed to insert task completion ratings: ${completionRatingError.message}`);
    }
  }

  const pimperRows = buildPimperRows({ users, householdId, completionRows });

  const { error: pimperError } = await supabase.from("household_member_pimpers").upsert(pimperRows);
  if (pimperError) {
    throw new Error(`Failed to upsert pimpers: ${pimperError.message}`);
  }

  const financeRows = buildFinanceRows({ financeCount, users, householdId, now });

  const { error: financeError } = await supabase.from("finance_entries").insert(financeRows);
  if (financeError) {
    throw new Error(`Failed to insert finance entries: ${financeError.message}`);
  }

  const cashAuditRows = buildCashAuditRows({
    householdId,
    requestedBy: owner.id,
    now,
    auditCount: cashAuditCount
  });
  const { error: cashAuditError } = await supabase.from("cash_audit_requests").insert(cashAuditRows);
  if (cashAuditError) {
    throw new Error(`Failed to insert cash audit requests: ${cashAuditError.message}`);
  }

  const shoppingRows = buildShoppingRows({
    shoppingCount,
    users,
    householdId,
    ownerId: owner.id,
    now
  });

  const { data: insertedShoppingItems, error: shoppingError } = await supabase
    .from("shopping_items")
    .insert(shoppingRows)
    .select("id, title, tags, done, done_by, done_at");
  if (shoppingError) {
    throw new Error(`Failed to insert shopping items: ${shoppingError.message}`);
  }

  const shoppingCompletionRows = buildShoppingCompletionRows({ insertedShoppingItems, householdId });
  if (shoppingCompletionRows.length > 0) {
    const { error: shoppingCompletionError } = await supabase
      .from("shopping_item_completions")
      .insert(shoppingCompletionRows);
    if (shoppingCompletionError) {
      throw new Error(`Failed to insert shopping completions: ${shoppingCompletionError.message}`);
    }
  }

  const bucketRows = buildBucketRows({
    users,
    householdId,
    ownerId: owner.id,
    now
  });
  const { data: insertedBucketItems, error: bucketError } = await supabase
    .from("bucket_items")
    .insert(bucketRows)
    .select("id, suggested_dates");
  if (bucketError) {
    throw new Error(`Failed to insert bucket items: ${bucketError.message}`);
  }

  const bucketVoteRows = buildBucketVoteRows({
    insertedBucketItems: insertedBucketItems ?? [],
    users,
    householdId
  });
  if (bucketVoteRows.length > 0) {
    const { error: bucketVoteError } = await supabase
      .from("bucket_item_date_votes")
      .insert(bucketVoteRows);
    if (bucketVoteError) {
      throw new Error(`Failed to insert bucket item votes: ${bucketVoteError.message}`);
    }
  }

  const eventRows = buildEventRows({
    householdId,
    completionRows,
    shoppingCompletionRows,
    financeRows,
    memberRows,
    insertedTasks
  });
  if (eventRows.length > 0) {
    const { error: eventError } = await supabase.from("household_events").insert(eventRows);
    if (eventError) {
      throw new Error(`Failed to insert household events: ${eventError.message}`);
    }
  }

  console.log("Seed done.");
  console.log(`Household: ${household.name} (${household.id})`);
  console.log(`Invite code: ${household.invite_code}`);
  console.log(`Users created: ${users.length}`);
  users.forEach((user) => {
    console.log(`- ${user.email} / password: DomoraDemo123!`);
  });
  console.log(`Tasks created: ${insertedTasks.length}`);
  console.log(`Task completion ratings created: ${completionRatingRows.length}`);
  console.log(`Finance entries created: ${financeRows.length}`);
  console.log(`Finance subscriptions created: ${subscriptionRows.length}`);
  console.log(`Cash audits created: ${cashAuditRows.length}`);
  console.log(`Shopping items created: ${insertedShoppingItems.length}`);
  console.log(`Shopping completions created: ${shoppingCompletionRows.length}`);
  console.log(`Bucket items created: ${insertedBucketItems?.length ?? 0}`);
  console.log(`Bucket votes created: ${bucketVoteRows.length}`);
  console.log(`Household events created: ${eventRows.length}`);
};

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

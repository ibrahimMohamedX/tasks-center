export default {
  async fetch(request, env) {
    return new Response(
      JSON.stringify({
        ok: true,
        service: "archai-tasks-notifications",
        project: env.FIREBASE_PROJECT_ID,
      }),
      {
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  },
};

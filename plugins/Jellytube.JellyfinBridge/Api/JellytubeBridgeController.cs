using System.Globalization;
using System.Text;
using System.Text.Json;
using Jellyfin.Data;
using Jellyfin.Database.Implementations.Enums;
using Jellytube.JellyfinBridge.Configuration;
using MediaBrowser.Common;
using MediaBrowser.Common.Api;
using MediaBrowser.Controller.Library;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;

namespace Jellytube.JellyfinBridge.Api;

[ApiController]
[Route("JellytubeBridge")]
public class JellytubeBridgeController : ControllerBase
{
    private readonly IApplicationHost _applicationHost;
    private readonly ILogger<JellytubeBridgeController> _logger;
    private readonly IUserManager _userManager;

    public JellytubeBridgeController(IApplicationHost applicationHost, IUserManager userManager, ILogger<JellytubeBridgeController> logger)
    {
        _applicationHost = applicationHost;
        _userManager = userManager;
        _logger = logger;
    }

    [HttpGet("start")]
    public ActionResult Start([FromQuery] string? returnTo = null, [FromQuery] string? url = null, [FromQuery] string? title = null)
    {
        if (User?.Identity?.IsAuthenticated != true)
        {
            return Redirect(BuildLaunchUri(returnTo, url, title));
        }

        var plugin = Plugin.Instance;
        if (plugin is null)
        {
            return Problem("Jellytube Bridge is not loaded.", statusCode: StatusCodes.Status500InternalServerError);
        }

        var config = plugin.Configuration;
        if (!config.IsConfigured())
        {
            return Problem("Jellytube Bridge is not configured yet.", statusCode: StatusCodes.Status503ServiceUnavailable);
        }

        var username = User?.Identity?.Name;
        if (string.IsNullOrWhiteSpace(username))
        {
            return Unauthorized();
        }

        var user = _userManager.GetUserByName(username);
        if (user is null)
        {
            return Unauthorized();
        }

        var safeReturnTo = BuildDesiredReturnTo(config, returnTo, url, title);
        var role = user.HasPermission(PermissionKind.IsAdministrator) ? "admin" : "user";
        var token = HandoffTokenIssuer.Issue(
            config.SharedSecret,
            user.Id.ToString(),
            user.Username,
            role,
            Math.Max(config.TokenLifetimeSeconds, 15),
            safeReturnTo);

        var handoffUri = BuildServiceUri(config, token);
        _logger.LogInformation("Issuing Jellytube handoff for user {Username}.", user.Username);
        return Redirect(handoffUri);
    }

    [HttpGet("launch")]
    public ContentResult Launch([FromQuery] string? returnTo = null, [FromQuery] string? url = null, [FromQuery] string? title = null, [FromQuery] string? manual = null)
    {
        var plugin = Plugin.Instance;
        var safeReturnTo = BuildDesiredReturnTo(plugin?.Configuration, returnTo, url, title);
        var sessionEndpoint = BuildSessionEndpoint(safeReturnTo, url, title);
        var loginPath = BuildJellyfinLoginUri();
        var manualMode = string.Equals(manual, "1", StringComparison.Ordinal);
        var encodedServerId = JavaScriptStringEncode(_applicationHost.SystemId);
        var encodedSessionEndpoint = JavaScriptStringEncode(sessionEndpoint);
        var encodedLoginPath = JavaScriptStringEncode(loginPath);
        var encodedManualMode = manualMode ? "true" : "false";

        var html = $$"""
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Web Video Requests</title>
    <style>
        :root {
            color-scheme: dark;
            font-family: Inter, system-ui, sans-serif;
            background: #07111f;
            color: #e5eefb;
        }

        body {
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            background:
                radial-gradient(circle at top left, rgba(121, 184, 255, 0.18), transparent 32%),
                radial-gradient(circle at bottom right, rgba(167, 139, 250, 0.2), transparent 30%),
                #07111f;
        }

        main {
            width: min(100%, 36rem);
            padding: 2rem;
            border-radius: 1.4rem;
            background: rgba(12, 20, 34, 0.92);
            border: 1px solid rgba(148, 163, 184, 0.16);
            box-shadow: 0 30px 90px rgba(0, 0, 0, 0.42);
        }

        h1 {
            margin: 0 0 0.75rem;
            font-size: 1.85rem;
            line-height: 1.1;
        }

        p {
            margin: 0;
            color: #aabbd4;
            line-height: 1.55;
        }

        .eyebrow {
            margin: 0 0 0.55rem;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            font-size: 0.78rem;
            color: #79b8ff;
        }

        .progress {
            display: flex;
            gap: 0.7rem;
            align-items: center;
            margin-top: 1.15rem;
            color: #e5eefb;
        }

        .pulse {
            width: 0.8rem;
            height: 0.8rem;
            border-radius: 999px;
            background: linear-gradient(135deg, #79b8ff, #a78bfa);
            box-shadow: 0 0 0 0 rgba(121, 184, 255, 0.4);
            animation: pulse 1.8s infinite;
        }

        button {
            margin-top: 1.25rem;
            border: 0;
            border-radius: 0.85rem;
            padding: 0.85rem 1rem;
            font: inherit;
            font-weight: 700;
            cursor: pointer;
            background: linear-gradient(135deg, #79b8ff, #a78bfa);
            color: #07111f;
        }

        button[hidden] {
            display: none;
        }

        .muted {
            margin-top: 0.95rem;
            font-size: 0.95rem;
        }

        @keyframes pulse {
            0% { box-shadow: 0 0 0 0 rgba(121, 184, 255, 0.4); }
            70% { box-shadow: 0 0 0 12px rgba(121, 184, 255, 0); }
            100% { box-shadow: 0 0 0 0 rgba(121, 184, 255, 0); }
        }
    </style>
</head>
<body>
    <main>
        <p class="eyebrow">Jellytube Bridge</p>
        <h1 id="heading">Opening web video requests</h1>
        <p id="message">Checking your existing Jellyfin session and preparing the handoff.</p>
        <div class="progress" id="progressRow">
            <div class="pulse" aria-hidden="true"></div>
            <span id="progressText">Checking session...</span>
        </div>
        <p class="muted" id="detail"></p>
        <button id="loginButton" hidden type="button">Continue</button>
    </main>

    <script>
        const serverId = "{{encodedServerId}}";
        const sessionEndpoint = "{{encodedSessionEndpoint}}";
        const loginPath = "{{encodedLoginPath}}";
        const manualMode = {{encodedManualMode}};
        const heading = document.getElementById('heading');
        const message = document.getElementById('message');
        const detail = document.getElementById('detail');
        const progressRow = document.getElementById('progressRow');
        const progressText = document.getElementById('progressText');
        const loginButton = document.getElementById('loginButton');

        let pollHandle = null;

        function parseCredentials() {
            try {
                const raw = localStorage.getItem('jellyfin_credentials');
                if (!raw) {
                    return null;
                }

                const data = JSON.parse(raw);
                const servers = Array.isArray(data.Servers) ? data.Servers : [];
                const match = servers.find((server) => server.Id === serverId && server.AccessToken);
                return match || servers.find((server) => server.AccessToken) || null;
            } catch {
                return null;
            }
        }

        async function continueToService() {
            const credentials = parseCredentials();
            if (!credentials?.AccessToken) {
                return false;
            }

            const response = await fetch(sessionEndpoint, {
                headers: {
                    'Accept': 'application/json',
                    'X-Emby-Token': credentials.AccessToken
                }
            });

            if (!response.ok) {
                return false;
            }

            const data = await response.json();
            if (!data?.redirectUrl) {
                return false;
            }

            window.location.replace(data.redirectUrl);
            return true;
        }

        function startPolling() {
            if (pollHandle) {
                return;
            }

            pollHandle = window.setInterval(async () => {
                if (await continueToService()) {
                    if (pollHandle) {
                        window.clearInterval(pollHandle);
                        pollHandle = null;
                    }
                }
            }, 1500);
        }

        function showManualPrompt() {
            heading.textContent = 'Continue to web video requests';
            message.textContent = 'We could not restore your session automatically yet.';
            detail.textContent = 'Continue to sign in. If you already finished sign-in in another tab, this page will continue automatically.';
            progressRow.hidden = true;
            loginButton.hidden = false;
        }

        function openLogin() {
            heading.textContent = 'Continue to web video requests';
            message.textContent = 'Finish signing in and this page will continue automatically.';
            detail.textContent = 'A Jellyfin sign-in page will open in another tab while this page waits for your session.';
            progressRow.hidden = false;
            progressText.textContent = 'Waiting for sign-in...';

            const popup = window.open(loginPath, '_blank');
            if (!popup) {
                detail.textContent = 'Your browser blocked the sign-in tab. Allow pop-ups for this site, then press Continue again.';
            }

            startPolling();
        }

        async function startFlow() {
            if (manualMode) {
                heading.textContent = 'Signed out';
                message.textContent = 'Continue when you want to open web video requests again.';
                detail.textContent = 'If your Jellyfin session is still active, this page will continue immediately. Otherwise a sign-in page will open.';
                progressRow.hidden = true;
                loginButton.hidden = false;
                startPolling();
                return;
            }

            if (await continueToService()) {
                return;
            }

            showManualPrompt();
            startPolling();
        }

        loginButton.addEventListener('click', async () => {
            progressRow.hidden = false;
            progressText.textContent = 'Checking session...';

            if (await continueToService()) {
                return;
            }

            openLogin();
        });

        startFlow().catch(() => {
            heading.textContent = 'Continue to web video requests';
            message.textContent = 'We could not restore your session automatically.';
            detail.textContent = 'Continue to sign in and this page will finish the handoff when your session appears.';
            progressRow.hidden = true;
            loginButton.hidden = false;
            startPolling();
        });
    </script>
</body>
</html>
""";

        return Content(html, "text/html", Encoding.UTF8);
    }

    [Authorize]
    [HttpGet("session")]
    public ActionResult GetSession([FromQuery] string? returnTo = null, [FromQuery] string? url = null, [FromQuery] string? title = null)
    {
        var plugin = Plugin.Instance;
        if (plugin is null)
        {
            return Problem("Jellytube Bridge is not loaded.", statusCode: StatusCodes.Status500InternalServerError);
        }

        var config = plugin.Configuration;
        if (!config.IsConfigured())
        {
            return Problem("Jellytube Bridge is not configured yet.", statusCode: StatusCodes.Status503ServiceUnavailable);
        }

        var username = User?.Identity?.Name;
        if (string.IsNullOrWhiteSpace(username))
        {
            return Unauthorized();
        }

        var user = _userManager.GetUserByName(username);
        if (user is null)
        {
            return Unauthorized();
        }

        var safeReturnTo = BuildDesiredReturnTo(config, returnTo, url, title);
        var role = user.HasPermission(PermissionKind.IsAdministrator) ? "admin" : "user";
        var token = HandoffTokenIssuer.Issue(
            config.SharedSecret,
            user.Id.ToString(),
            user.Username,
            role,
            Math.Max(config.TokenLifetimeSeconds, 15),
            safeReturnTo);

        _logger.LogInformation("Issuing Jellytube session redirect for user {Username}.", user.Username);
        return Ok(new
        {
            redirectUrl = BuildServiceUri(config, token)
        });
    }

    [Authorize(Policy = Policies.RequiresElevation)]
    [HttpGet("config")]
    public ActionResult<PluginConfiguration> GetConfiguration()
    {
        return Ok(Plugin.Instance?.Configuration ?? new PluginConfiguration());
    }

    [Authorize(Policy = Policies.RequiresElevation)]
    [HttpPost("config")]
    public ActionResult<PluginConfiguration> SaveConfiguration([FromBody] PluginConfiguration configuration)
    {
        var plugin = Plugin.Instance;
        if (plugin is null)
        {
            return Problem("Jellytube Bridge is not loaded.", statusCode: StatusCodes.Status500InternalServerError);
        }

        configuration.ServiceBaseUrl = configuration.ServiceBaseUrl.Trim();
        configuration.ServiceHandoffPath = NormalizeServiceHandoffPath(configuration.ServiceHandoffPath);
        configuration.DefaultReturnPath = NormalizeReturnTo(configuration.DefaultReturnPath) ?? "/";
        configuration.TokenLifetimeSeconds = Math.Max(configuration.TokenLifetimeSeconds, 15);

        plugin.UpdateConfiguration(configuration);
        _logger.LogInformation("Updated Jellytube Bridge configuration.");
        return Ok(configuration);
    }

    [HttpGet("health")]
    public ActionResult GetHealth()
    {
        return Ok(new
        {
            configured = Plugin.Instance?.Configuration.IsConfigured() ?? false
        });
    }

    private static string BuildServiceUri(PluginConfiguration configuration, string token)
    {
        var builder = new UriBuilder(configuration.ServiceBaseUrl.TrimEnd('/'));
        builder.Path = CombinePaths(builder.Path, configuration.ServiceHandoffPath);
        builder.Query = $"token={Uri.EscapeDataString(token)}";
        return builder.Uri.ToString();
    }

    private string BuildJellyfinLoginUri()
    {
        return string.Create(
            CultureInfo.InvariantCulture,
            $"{Request.PathBase}/web/#/login?serverid={Uri.EscapeDataString(_applicationHost.SystemId)}");
    }

    private string BuildLaunchUri(string? returnTo, string? url, string? title)
    {
        var query = BuildLaunchQuery(BuildDesiredReturnTo(Plugin.Instance?.Configuration, returnTo, url, title), url, title);
        return string.Create(CultureInfo.InvariantCulture, $"{Request.PathBase}/JellytubeBridge/launch{query}");
    }

    private string BuildSessionEndpoint(string returnTo, string? url, string? title)
    {
        return string.Create(CultureInfo.InvariantCulture, $"{Request.PathBase}/JellytubeBridge/session{BuildLaunchQuery(returnTo, url, title)}");
    }

    private static string BuildLaunchQuery(string returnTo, string? url, string? title)
    {
        var parameters = new List<string>
        {
            $"returnTo={Uri.EscapeDataString(returnTo)}"
        };

        if (!string.IsNullOrWhiteSpace(url))
        {
            parameters.Add($"url={Uri.EscapeDataString(url.Trim())}");
        }

        if (!string.IsNullOrWhiteSpace(title))
        {
            parameters.Add($"title={Uri.EscapeDataString(title.Trim())}");
        }

        return $"?{string.Join("&", parameters)}";
    }

    private static string BuildDesiredReturnTo(PluginConfiguration? configuration, string? returnTo, string? url, string? title)
    {
        var basePath = NormalizeReturnTo(returnTo) ?? NormalizeReturnTo(configuration?.DefaultReturnPath) ?? "/";
        var parameters = new List<string>();

        if (!string.IsNullOrWhiteSpace(url))
        {
            parameters.Add($"url={Uri.EscapeDataString(url.Trim())}");
        }

        if (!string.IsNullOrWhiteSpace(title))
        {
            parameters.Add($"title={Uri.EscapeDataString(title.Trim())}");
        }

        if (parameters.Count == 0)
        {
            return basePath;
        }

        var separator = basePath.Contains('?', StringComparison.Ordinal) ? '&' : '?';
        return $"{basePath}{separator}{string.Join("&", parameters)}";
    }

    private static string CombinePaths(string left, string right)
    {
        var normalizedLeft = string.IsNullOrWhiteSpace(left) ? string.Empty : left.TrimEnd('/');
        var normalizedRight = NormalizeServiceHandoffPath(right);
        return $"{normalizedLeft}{normalizedRight}";
    }

    private static string NormalizeServiceHandoffPath(string? path)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            return "/auth/handoff";
        }

        return path.StartsWith('/') ? path : $"/{path}";
    }

    private static string? NormalizeReturnTo(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        return value.StartsWith('/') && !value.StartsWith("//", StringComparison.Ordinal) ? value : null;
    }

    private static string JavaScriptStringEncode(string value)
        => JsonSerializer.Serialize(value).Trim('"');
}

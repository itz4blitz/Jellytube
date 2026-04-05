using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Jellytube.JellyfinBridge;

internal static class HandoffTokenIssuer
{
    public static string Issue(
        string sharedSecret,
        string userId,
        string username,
        string role,
        int tokenLifetimeSeconds,
        string returnTo)
    {
        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var headerSegment = Base64UrlEncode(JsonSerializer.SerializeToUtf8Bytes(new Dictionary<string, string>
        {
            ["alg"] = "HS256",
            ["typ"] = "JWT"
        }));

        var payloadSegment = Base64UrlEncode(JsonSerializer.SerializeToUtf8Bytes(new Dictionary<string, object?>
        {
            ["iss"] = "jellytube-bridge",
            ["sub"] = userId,
            ["name"] = username,
            ["role"] = role,
            ["iat"] = now,
            ["exp"] = now + tokenLifetimeSeconds,
            ["jti"] = Guid.NewGuid().ToString("D"),
            ["returnTo"] = returnTo
        }));

        var signingInput = $"{headerSegment}.{payloadSegment}";
        var signature = Base64UrlEncode(Sign(signingInput, sharedSecret));
        return $"{signingInput}.{signature}";
    }

    private static byte[] Sign(string input, string sharedSecret)
    {
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(sharedSecret));
        return hmac.ComputeHash(Encoding.UTF8.GetBytes(input));
    }

    private static string Base64UrlEncode(byte[] value)
    {
        return Convert.ToBase64String(value)
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');
    }
}

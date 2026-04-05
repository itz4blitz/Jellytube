using MediaBrowser.Model.Plugins;

namespace Jellytube.JellyfinBridge.Configuration;

public sealed class PluginConfiguration : BasePluginConfiguration
{
    public string ServiceBaseUrl { get; set; } = string.Empty;

    public string ServiceHandoffPath { get; set; } = "/auth/handoff";

    public string SharedSecret { get; set; } = string.Empty;

    public int TokenLifetimeSeconds { get; set; } = 60;

    public string DefaultReturnPath { get; set; } = "/";

    public bool IsConfigured()
    {
        return !string.IsNullOrWhiteSpace(ServiceBaseUrl) && !string.IsNullOrWhiteSpace(SharedSecret);
    }
}

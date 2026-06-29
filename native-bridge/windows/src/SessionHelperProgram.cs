namespace Assistane.NativeBridge;

public static class SessionHelperProgram
{
    public static int Main(string[] args)
    {
        var mergedArgs = args.Contains("--session-helper", StringComparer.OrdinalIgnoreCase)
            ? args
            : args.Concat(["--session-helper"]).ToArray();

        return Program.Main(mergedArgs);
    }
}

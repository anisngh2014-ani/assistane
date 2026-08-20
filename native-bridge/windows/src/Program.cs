using System.Diagnostics;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;

namespace Assistane.NativeBridge;

public static class Program
{
    private static readonly ManualResetEventSlim StopEvent = new(false);
    private static BridgeRuntime? _runtime;
    private static NativeMethods.ServiceStatusHandle _serviceStatusHandle = new();
    private static NativeMethods.ServiceControlHandlerEx? _handler;
    private static NativeMethods.ServiceMain? _serviceMain;

    public static int Main(string[] args)
    {
        if (args.Contains("--session-helper", StringComparer.OrdinalIgnoreCase))
        {
            return RunSessionHelper();
        }

        if (args.Contains("--service", StringComparer.OrdinalIgnoreCase))
        {
            return RunService();
        }

        return RunConsole();
    }

    private static int RunConsole()
    {
        Console.WriteLine("Assistane Native Bridge running in console mode.");
        Console.CancelKeyPress += (_, e) =>
        {
            e.Cancel = true;
            StopEvent.Set();
        };

        _runtime = new BridgeRuntime(ServiceMode.Console);
        _runtime.Start();
        StopEvent.Wait();
        _runtime.Stop();
        return 0;
    }

    private static int RunSessionHelper()
    {
        Console.WriteLine("Assistane Native Bridge session helper started.");
        _runtime = new BridgeRuntime(ServiceMode.SessionHelper);
        _runtime.Start();
        StopEvent.Wait();
        _runtime.Stop();
        return 0;
    }

    private static int RunService()
    {
        _serviceMain = ServiceMain;
        var table = new[]
        {
            new NativeMethods.ServiceTableEntry { ServiceName = "AssistaneNativeBridge", ServiceProc = _serviceMain },
            new NativeMethods.ServiceTableEntry { ServiceName = null, ServiceProc = null }
        };

        if (!NativeMethods.StartServiceCtrlDispatcher(table))
        {
            return Marshal.GetLastWin32Error();
        }

        return 0;
    }

    private static void ServiceMain(int argc, IntPtr argv)
    {
        _handler = ServiceControlHandler;
        _serviceStatusHandle = NativeMethods.RegisterServiceCtrlHandlerEx("AssistaneNativeBridge", _handler, IntPtr.Zero);
        if (_serviceStatusHandle.IsInvalid) return;

        SetServiceStatus(NativeMethods.ServiceState.StartPending);
        _runtime = new BridgeRuntime(ServiceMode.WindowsService);
        _runtime.Start();
        SetServiceStatus(NativeMethods.ServiceState.Running);

        StopEvent.Wait();
        SetServiceStatus(NativeMethods.ServiceState.StopPending);
        _runtime.Stop();
        SetServiceStatus(NativeMethods.ServiceState.Stopped);
    }

    private static int ServiceControlHandler(int control, int eventType, IntPtr eventData, IntPtr context)
    {
        if (control is NativeMethods.ServiceControlStop or NativeMethods.ServiceControlShutdown)
        {
            StopEvent.Set();
            return 0;
        }

        if (control == NativeMethods.ServiceControlSessionChange)
        {
            _runtime?.RefreshSessionState("service-session-change");
        }

        return 0;
    }

    private static void SetServiceStatus(NativeMethods.ServiceState state)
    {
        var status = new NativeMethods.ServiceStatus
        {
            ServiceType = NativeMethods.ServiceWin32OwnProcess,
            CurrentState = state,
            ControlsAccepted = state == NativeMethods.ServiceState.Running
                ? NativeMethods.ServiceAcceptStop | NativeMethods.ServiceAcceptShutdown | NativeMethods.ServiceAcceptSessionChange
                : 0,
            Win32ExitCode = 0,
            ServiceSpecificExitCode = 0,
            CheckPoint = 0,
            WaitHint = 0
        };
        NativeMethods.SetServiceStatus(_serviceStatusHandle, ref status);
    }
}

internal enum ServiceMode
{
    Console,
    WindowsService,
    SessionHelper
}

internal sealed class BridgeRuntime
{
    private readonly ServiceMode _mode;
    private readonly CancellationTokenSource _cts = new();
    private Task? _pipeTask;
    private Task? _heartbeatTask;
    private Task? _supervisorTask;
    private readonly object _statusLock = new();
    private BridgeStatus _status = BridgeStatus.Create(ServiceMode.Console);

    public BridgeRuntime(ServiceMode mode)
    {
        _mode = mode;
        _status = BridgeStatus.Create(mode);
    }

    public void Start()
    {
        Directory.CreateDirectory(StatusStore.DirectoryPath);
        RefreshSessionState("startup");
        _pipeTask = Task.Run(() => RunPipeServer(_cts.Token));
        _heartbeatTask = Task.Run(() => RunHeartbeat(_cts.Token));
        _supervisorTask = Task.Run(() => RunAgentSupervisor(_cts.Token));
    }

    public void Stop()
    {
        _cts.Cancel();
        Task.WaitAll(new[] { _pipeTask, _heartbeatTask, _supervisorTask }.Where(t => t != null).Cast<Task>().ToArray(), 3000);
        WriteStatus("stopped");
    }

    public void RefreshSessionState(string reason)
    {
        var session = WindowsSession.GetActiveSession();
        lock (_statusLock)
        {
            _status.ActiveSessionId = session.SessionId;
            _status.ActiveUser = session.User;
            _status.SessionState = session.State;
            _status.LastSessionReason = reason;
            _status.UpdatedAtUtc = DateTimeOffset.UtcNow;
            _status.AgentRunning = AgentSupervisor.IsAgentRunning();
        }
        WriteStatus(reason);
    }

    private async Task RunHeartbeat(CancellationToken token)
    {
        while (!token.IsCancellationRequested)
        {
            RefreshSessionState("heartbeat");
            await Task.Delay(TimeSpan.FromSeconds(15), token).ContinueWith(_ => { }, CancellationToken.None);
        }
    }

    private async Task RunAgentSupervisor(CancellationToken token)
    {
        while (!token.IsCancellationRequested)
        {
            try
            {
                var running = AgentSupervisor.IsAgentRunning();
                lock (_statusLock)
                {
                    _status.AgentRunning = running;
                    _status.AgentPath = AgentSupervisor.ResolveAgentPath();
                    _status.UpdatedAtUtc = DateTimeOffset.UtcNow;
                }

                if (!running && _mode == ServiceMode.WindowsService)
                {
                    AgentSupervisor.TryRunWatchdogTask();
                }

                var session = WindowsSession.GetActiveSession();
                var helperRunning = SessionHelperSupervisor.IsHelperRunning(session.SessionId);
                lock (_statusLock)
                {
                    _status.SessionHelperRunning = helperRunning;
                    _status.SessionHelperPath = SessionHelperSupervisor.ResolveHelperPath();
                    _status.UpdatedAtUtc = DateTimeOffset.UtcNow;
                }

                if (!helperRunning && _mode == ServiceMode.WindowsService)
                {
                    SessionHelperSupervisor.TryLaunchInActiveSession();
                }
            }
            catch (Exception ex)
            {
                lock (_statusLock)
                {
                    _status.LastError = ex.Message;
                    _status.UpdatedAtUtc = DateTimeOffset.UtcNow;
                }
            }

            WriteStatus("supervisor");
            await Task.Delay(TimeSpan.FromSeconds(20), token).ContinueWith(_ => { }, CancellationToken.None);
        }
    }

    private async Task RunPipeServer(CancellationToken token)
    {
        while (!token.IsCancellationRequested)
        {
            try
            {
                await using var pipe = new NamedPipeServerStream(
                    "AssistaneNativeBridge",
                    PipeDirection.InOut,
                    4,
                    PipeTransmissionMode.Message,
                    PipeOptions.Asynchronous);

                await pipe.WaitForConnectionAsync(token);
                using var reader = new StreamReader(pipe, Encoding.UTF8, leaveOpen: true);
                await using var writer = new StreamWriter(pipe, Encoding.UTF8, leaveOpen: true) { AutoFlush = true };
                var request = await reader.ReadLineAsync(token);
                var response = HandleRequest(request);
                await writer.WriteLineAsync(response);
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                lock (_statusLock)
                {
                    _status.LastError = ex.Message;
                    _status.UpdatedAtUtc = DateTimeOffset.UtcNow;
                }
                WriteStatus("pipe-error");
            }
        }
    }

    private string HandleRequest(string? request)
    {
        try
        {
            var command = string.IsNullOrWhiteSpace(request)
                ? "get_status"
                : JsonDocument.Parse(request).RootElement.GetProperty("command").GetString() ?? "get_status";

            if (command == "ping")
            {
                return JsonSerializer.Serialize(new { ok = true, type = "pong", at = DateTimeOffset.UtcNow });
            }

            if (command == "launch_agent")
            {
                AgentSupervisor.TryRunWatchdogTask();
                RefreshSessionState("launch-agent");
            }

            if (command is "get_status" or "lock_state_probe" or "prepare_session")
            {
                RefreshSessionState(command);
            }

            lock (_statusLock)
            {
                return JsonSerializer.Serialize(new { ok = true, type = "status", status = _status }, JsonOptions.Default);
            }
        }
        catch (Exception ex)
        {
            return JsonSerializer.Serialize(new { ok = false, type = "error", error = ex.Message });
        }
    }

    private void WriteStatus(string reason)
    {
        BridgeStatus snapshot;
        lock (_statusLock)
        {
            _status.LastHeartbeatReason = reason;
            _status.UpdatedAtUtc = DateTimeOffset.UtcNow;
            snapshot = _status;
        }
        StatusStore.Write(snapshot);
    }
}

internal sealed record BridgeStatus
{
    public string Mode { get; set; } = "";
    public string Version { get; set; } = "1.0.0";
    public DateTimeOffset StartedAtUtc { get; set; }
    public DateTimeOffset UpdatedAtUtc { get; set; }
    public uint ActiveSessionId { get; set; }
    public string ActiveUser { get; set; } = "";
    public string SessionState { get; set; } = "";
    public string LastSessionReason { get; set; } = "";
    public bool AgentRunning { get; set; }
    public string AgentPath { get; set; } = "";
    public bool SessionHelperRunning { get; set; }
    public string SessionHelperPath { get; set; } = "";
    public string LastHeartbeatReason { get; set; } = "";
    public string LastError { get; set; } = "";
    public string[] Capabilities { get; set; } =
    [
        "start-before-user-app",
        "auto-run-after-reboot",
        "active-session-detection",
        "lock-unlock-recovery-signal",
        "active-session-helper",
        "agent-watchdog",
        "background-status-heartbeat",
        "future-driver-integration-point"
    ];

    public static BridgeStatus Create(ServiceMode mode) => new()
    {
        Mode = mode.ToString(),
        StartedAtUtc = DateTimeOffset.UtcNow,
        UpdatedAtUtc = DateTimeOffset.UtcNow,
        AgentPath = AgentSupervisor.ResolveAgentPath(),
        SessionHelperPath = SessionHelperSupervisor.ResolveHelperPath()
    };
}

internal static class AgentSupervisor
{
    public static bool IsAgentRunning()
    {
        return Process.GetProcessesByName("Assistane Agent").Length > 0 ||
               Process.GetProcessesByName("AssistaneAgent").Length > 0;
    }

    public static string ResolveAgentPath()
    {
        var bridgeDir = AppContext.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar);
        var candidate = Path.GetFullPath(Path.Combine(bridgeDir, "..", "..", "..", "Assistane Agent.exe"));
        return File.Exists(candidate) ? candidate : "";
    }

    public static void TryRunWatchdogTask()
    {
        try
        {
            using var proc = Process.Start(new ProcessStartInfo
            {
                FileName = "schtasks.exe",
                Arguments = "/Run /TN \"Assistane Agent Watchdog\"",
                CreateNoWindow = true,
                UseShellExecute = false,
                WindowStyle = ProcessWindowStyle.Hidden
            });
            proc?.WaitForExit(5000);
        }
        catch
        {
            // The scheduled task is optional; the visible Agent remains the primary app.
        }
    }
}

internal static class SessionHelperSupervisor
{
    public static string ResolveHelperPath()
    {
        var bridgeDir = AppContext.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar);
        var candidate = Path.Combine(bridgeDir, "AssistaneSessionHelper.exe");
        return File.Exists(candidate) ? candidate : "";
    }

    public static bool IsHelperRunning(uint sessionId)
    {
        try
        {
            return Process.GetProcessesByName("AssistaneSessionHelper")
                .Any(process =>
                {
                    try { return process.SessionId == (int)sessionId; }
                    catch { return false; }
                });
        }
        catch
        {
            return false;
        }
    }

    public static bool TryLaunchInActiveSession()
    {
        var helperPath = ResolveHelperPath();
        if (string.IsNullOrWhiteSpace(helperPath)) return false;

        var session = WindowsSession.GetActiveSession();
        if (session.SessionId == uint.MaxValue || (session.State != "Active" && session.State != "Connected")) return false;
        if (IsHelperRunning(session.SessionId)) return true;

        if (!NativeMethods.WTSQueryUserToken(session.SessionId, out var userToken)) return false;

        IntPtr environment = IntPtr.Zero;
        try
        {
            NativeMethods.CreateEnvironmentBlock(out environment, userToken, false);
            var startup = new NativeMethods.StartupInfo
            {
                Cb = Marshal.SizeOf<NativeMethods.StartupInfo>(),
                Desktop = "winsta0\\default"
            };
            var processInfo = new NativeMethods.ProcessInformation();
            var commandLine = $"\"{helperPath}\" --session-helper";

            var created = NativeMethods.CreateProcessAsUser(
                userToken,
                null,
                commandLine,
                IntPtr.Zero,
                IntPtr.Zero,
                false,
                NativeMethods.CreateUnicodeEnvironment,
                environment,
                Path.GetDirectoryName(helperPath),
                ref startup,
                out processInfo);

            if (created)
            {
                NativeMethods.CloseHandle(processInfo.Process);
                NativeMethods.CloseHandle(processInfo.Thread);
            }

            return created;
        }
        finally
        {
            if (environment != IntPtr.Zero) NativeMethods.DestroyEnvironmentBlock(environment);
            NativeMethods.CloseHandle(userToken);
        }
    }
}

internal static class StatusStore
{
    public static string DirectoryPath => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
        "Assistane",
        "NativeBridge");

    private static string StatusPath => Path.Combine(DirectoryPath, "status.json");

    public static void Write(BridgeStatus status)
    {
        Directory.CreateDirectory(DirectoryPath);
        var tmp = StatusPath + ".tmp";
        File.WriteAllText(tmp, JsonSerializer.Serialize(status, JsonOptions.Default), Encoding.UTF8);
        File.Move(tmp, StatusPath, true);
    }
}

internal static class WindowsSession
{
    public static SessionInfo GetActiveSession()
    {
        var sessionId = NativeMethods.WTSGetActiveConsoleSessionId();
        var state = QueryString(sessionId, NativeMethods.WtsInfoClass.WTSConnectState);
        var user = QueryString(sessionId, NativeMethods.WtsInfoClass.WTSUserName);
        var domain = QueryString(sessionId, NativeMethods.WtsInfoClass.WTSDomainName);
        var fullUser = string.IsNullOrWhiteSpace(user) ? "" : string.IsNullOrWhiteSpace(domain) ? user : $"{domain}\\{user}";
        return new SessionInfo(sessionId, fullUser, string.IsNullOrWhiteSpace(state) ? "Unknown" : state);
    }

    private static string QueryString(uint sessionId, NativeMethods.WtsInfoClass infoClass)
    {
        if (!NativeMethods.WTSQuerySessionInformation(
                IntPtr.Zero,
                sessionId,
                infoClass,
                out var buffer,
                out var bytesReturned))
        {
            return "";
        }

        try
        {
            if (bytesReturned <= 1) return "";
            if (infoClass == NativeMethods.WtsInfoClass.WTSConnectState)
            {
                var value = Marshal.ReadInt32(buffer);
                return ((NativeMethods.WtsConnectState)value).ToString();
            }
            return Marshal.PtrToStringUni(buffer) ?? "";
        }
        finally
        {
            NativeMethods.WTSFreeMemory(buffer);
        }
    }
}

internal sealed record SessionInfo(uint SessionId, string User, string State);

internal static class JsonOptions
{
    public static readonly JsonSerializerOptions Default = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };
}

internal static class NativeMethods
{
    public const int ServiceWin32OwnProcess = 0x00000010;
    public const int ServiceAcceptStop = 0x00000001;
    public const int ServiceAcceptShutdown = 0x00000004;
    public const int ServiceAcceptSessionChange = 0x00000080;
    public const int ServiceControlStop = 0x00000001;
    public const int ServiceControlShutdown = 0x00000005;
    public const int ServiceControlSessionChange = 0x0000000E;
    public const int CreateUnicodeEnvironment = 0x00000400;

    public enum ServiceState
    {
        Stopped = 1,
        StartPending = 2,
        StopPending = 3,
        Running = 4
    }

    public enum WtsInfoClass
    {
        WTSUserName = 5,
        WTSConnectState = 8,
        WTSDomainName = 7
    }

    public enum WtsConnectState
    {
        Active = 0,
        Connected = 1,
        ConnectQuery = 2,
        Shadow = 3,
        Disconnected = 4,
        Idle = 5,
        Listen = 6,
        Reset = 7,
        Down = 8,
        Init = 9
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct ServiceStatus
    {
        public int ServiceType;
        public ServiceState CurrentState;
        public int ControlsAccepted;
        public int Win32ExitCode;
        public int ServiceSpecificExitCode;
        public int CheckPoint;
        public int WaitHint;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct ServiceTableEntry
    {
        public string? ServiceName;
        public ServiceMain? ServiceProc;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct StartupInfo
    {
        public int Cb;
        public string? Reserved;
        public string? Desktop;
        public string? Title;
        public int X;
        public int Y;
        public int XSize;
        public int YSize;
        public int XCountChars;
        public int YCountChars;
        public int FillAttribute;
        public int Flags;
        public short ShowWindow;
        public short Reserved2;
        public IntPtr Reserved2Pointer;
        public IntPtr StdInput;
        public IntPtr StdOutput;
        public IntPtr StdError;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct ProcessInformation
    {
        public IntPtr Process;
        public IntPtr Thread;
        public int ProcessId;
        public int ThreadId;
    }

    public sealed class ServiceStatusHandle : SafeHandle
    {
        public ServiceStatusHandle() : base(IntPtr.Zero, true) { }
        public override bool IsInvalid => handle == IntPtr.Zero;
        protected override bool ReleaseHandle() => true;
    }

    public delegate void ServiceMain(int argc, IntPtr argv);
    public delegate int ServiceControlHandlerEx(int control, int eventType, IntPtr eventData, IntPtr context);

    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    public static extern bool StartServiceCtrlDispatcher(ServiceTableEntry[] serviceTable);

    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    public static extern ServiceStatusHandle RegisterServiceCtrlHandlerEx(
        string serviceName,
        ServiceControlHandlerEx handler,
        IntPtr context);

    [DllImport("advapi32.dll", SetLastError = true)]
    public static extern bool SetServiceStatus(ServiceStatusHandle serviceStatusHandle, ref ServiceStatus serviceStatus);

    [DllImport("kernel32.dll")]
    public static extern uint WTSGetActiveConsoleSessionId();

    [DllImport("wtsapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    public static extern bool WTSQuerySessionInformation(
        IntPtr server,
        uint sessionId,
        WtsInfoClass infoClass,
        out IntPtr buffer,
        out int bytesReturned);

    [DllImport("wtsapi32.dll")]
    public static extern void WTSFreeMemory(IntPtr buffer);

    [DllImport("wtsapi32.dll", SetLastError = true)]
    public static extern bool WTSQueryUserToken(uint sessionId, out IntPtr token);

    [DllImport("userenv.dll", SetLastError = true)]
    public static extern bool CreateEnvironmentBlock(out IntPtr environment, IntPtr token, bool inherit);

    [DllImport("userenv.dll", SetLastError = true)]
    public static extern bool DestroyEnvironmentBlock(IntPtr environment);

    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    public static extern bool CreateProcessAsUser(
        IntPtr token,
        string? applicationName,
        string commandLine,
        IntPtr processAttributes,
        IntPtr threadAttributes,
        bool inheritHandles,
        int creationFlags,
        IntPtr environment,
        string? currentDirectory,
        ref StartupInfo startupInfo,
        out ProcessInformation processInformation);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool CloseHandle(IntPtr handle);
}

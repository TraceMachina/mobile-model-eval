import Cocoa
import ApplicationServices
import Foundation

enum InputAction {
    case tap(Double, Double)
    case swipe(Double, Double, Double, Double, useconds_t)
    case longPress(Double, Double, useconds_t)
    case key(String)
}

struct Config {
    let appName: String
    let windowMatch: String?
    let screenWidth: Double
    let screenHeight: Double
    let action: InputAction
}

func fail(_ message: String) -> Never {
    fputs("simulator_input.swift: \(message)\n", stderr)
    exit(1)
}

func envDouble(_ key: String, defaultValue: Double) -> Double {
    guard let rawValue = ProcessInfo.processInfo.environment[key] else {
        return defaultValue
    }
    return Double(rawValue) ?? defaultValue
}

func parseArgs() -> Config {
    var args = Array(CommandLine.arguments.dropFirst())
    var appName = "Simulator"
    var windowMatch: String?
    var screenWidth: Double?
    var screenHeight: Double?

    func popValue(_ flag: String) -> String {
        guard !args.isEmpty else {
            fail("missing value for \(flag)")
        }
        return args.removeFirst()
    }

    while let first = args.first, first.hasPrefix("--") {
        _ = args.removeFirst()
        switch first {
        case "--app-name":
            appName = popValue(first)
        case "--window-match":
            windowMatch = popValue(first)
        case "--screen-width":
            screenWidth = Double(popValue(first))
        case "--screen-height":
            screenHeight = Double(popValue(first))
        default:
            fail("unknown option \(first)")
        }
    }

    guard let width = screenWidth, let height = screenHeight else {
        fail("--screen-width and --screen-height are required")
    }

    guard let verb = args.first else {
        fail("missing action")
    }
    _ = args.removeFirst()

    let action: InputAction
    switch verb {
    case "tap":
        guard args.count == 2, let x = Double(args[0]), let y = Double(args[1]) else {
            fail("tap requires x y")
        }
        action = .tap(x, y)
    case "swipe":
        guard args.count == 5,
              let x1 = Double(args[0]),
              let y1 = Double(args[1]),
              let x2 = Double(args[2]),
              let y2 = Double(args[3]),
              let durationMs = UInt32(args[4]) else {
            fail("swipe requires x1 y1 x2 y2 durationMs")
        }
        action = .swipe(x1, y1, x2, y2, useconds_t(durationMs * 1000))
    case "long-press":
        guard args.count == 3,
              let x = Double(args[0]),
              let y = Double(args[1]),
              let durationMs = UInt32(args[2]) else {
            fail("long-press requires x y durationMs")
        }
        action = .longPress(x, y, useconds_t(durationMs * 1000))
    case "key":
        guard args.count == 1 else {
            fail("key requires a button name")
        }
        action = .key(args[0])
    default:
        fail("unknown action \(verb)")
    }

    return Config(
        appName: appName,
        windowMatch: windowMatch,
        screenWidth: width,
        screenHeight: height,
        action: action
    )
}

func findWindowFrame(appName: String, windowMatch: String?) -> CGRect {
    let windowList = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID)
    guard let windows = windowList as? [[String: Any]] else {
        fail("unable to query window list")
    }

    func rect(from info: [String: Any]) -> CGRect? {
        guard let boundsValue = info[kCGWindowBounds as String] else {
            return nil
        }
        return CGRect(dictionaryRepresentation: boundsValue as! CFDictionary)
    }

    let matchingWindows = windows.filter { info in
        let ownerName = info[kCGWindowOwnerName as String] as? String
        let layer = info[kCGWindowLayer as String] as? Int ?? 0
        guard ownerName == appName, layer == 0 else {
            return false
        }
        guard let match = windowMatch, !match.isEmpty else {
            return true
        }
        let windowName = info[kCGWindowName as String] as? String ?? ""
        return windowName.contains(match)
    }

    if let rectValue = matchingWindows.compactMap(rect(from:)).first {
        return rectValue
    }

    let fallbackWindows = windows.filter { info in
        let ownerName = info[kCGWindowOwnerName as String] as? String
        let layer = info[kCGWindowLayer as String] as? Int ?? 0
        return ownerName == appName && layer == 0
    }

    if let rectValue = fallbackWindows.compactMap(rect(from:)).first {
        return rectValue
    }

    fail("unable to find a visible Simulator window")
}

func screenRect(in windowFrame: CGRect, screenWidth: Double, screenHeight: Double) -> CGRect {
    let titlebarHeight = envDouble("IOS_SIMULATOR_WINDOW_TOP_INSET", defaultValue: 28)
    let insetLeft = envDouble("IOS_SIMULATOR_WINDOW_LEFT_INSET", defaultValue: 0)
    let insetRight = envDouble("IOS_SIMULATOR_WINDOW_RIGHT_INSET", defaultValue: 0)
    let insetBottom = envDouble("IOS_SIMULATOR_WINDOW_BOTTOM_INSET", defaultValue: 0)

    let contentRect = CGRect(
        x: windowFrame.minX + insetLeft,
        y: windowFrame.minY + titlebarHeight,
        width: windowFrame.width - insetLeft - insetRight,
        height: windowFrame.height - titlebarHeight - insetBottom
    )

    let scale = min(contentRect.width / screenWidth, contentRect.height / screenHeight)
    let fittedWidth = screenWidth * scale
    let fittedHeight = screenHeight * scale

    return CGRect(
        x: contentRect.midX - fittedWidth / 2,
        y: contentRect.midY - fittedHeight / 2,
        width: fittedWidth,
        height: fittedHeight
    )
}

func devicePointToHost(_ point: CGPoint, screenRect: CGRect, screenWidth: Double, screenHeight: Double) -> CGPoint {
    let x = screenRect.minX + (point.x / screenWidth) * screenRect.width
    let y = screenRect.minY + (point.y / screenHeight) * screenRect.height
    return CGPoint(x: x, y: y)
}

func postMouseEvent(type: CGEventType, point: CGPoint) {
    guard let event = CGEvent(mouseEventSource: nil, mouseType: type, mouseCursorPosition: point, mouseButton: .left) else {
        fail("unable to create mouse event")
    }
    event.post(tap: .cghidEventTap)
}

func postKeyboardShortcut(keyCode: CGKeyCode, modifiers: CGEventFlags) {
    guard let keyDown = CGEvent(keyboardEventSource: nil, virtualKey: keyCode, keyDown: true),
          let keyUp = CGEvent(keyboardEventSource: nil, virtualKey: keyCode, keyDown: false) else {
        fail("unable to create keyboard events")
    }
    keyDown.flags = modifiers
    keyUp.flags = modifiers
    keyDown.post(tap: .cghidEventTap)
    keyUp.post(tap: .cghidEventTap)
}

func ensureAccessibilityPermissions() {
    let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
    if !AXIsProcessTrustedWithOptions(options) {
        fail("Accessibility permissions are required to control the Simulator window")
    }
}

func activateSimulator() {
    if let app = NSRunningApplication.runningApplications(withBundleIdentifier: "com.apple.iphonesimulator").first {
        app.activate()
        usleep(200_000)
    }
}

func perform(_ action: InputAction, screenRect: CGRect, screenWidth: Double, screenHeight: Double) {
    switch action {
    case let .tap(x, y):
        let point = devicePointToHost(CGPoint(x: x, y: y), screenRect: screenRect, screenWidth: screenWidth, screenHeight: screenHeight)
        postMouseEvent(type: .mouseMoved, point: point)
        usleep(20_000)
        postMouseEvent(type: .leftMouseDown, point: point)
        usleep(40_000)
        postMouseEvent(type: .leftMouseUp, point: point)
    case let .longPress(x, y, durationMicros):
        let point = devicePointToHost(CGPoint(x: x, y: y), screenRect: screenRect, screenWidth: screenWidth, screenHeight: screenHeight)
        postMouseEvent(type: .mouseMoved, point: point)
        usleep(20_000)
        postMouseEvent(type: .leftMouseDown, point: point)
        usleep(durationMicros)
        postMouseEvent(type: .leftMouseUp, point: point)
    case let .swipe(x1, y1, x2, y2, durationMicros):
        let startPoint = devicePointToHost(CGPoint(x: x1, y: y1), screenRect: screenRect, screenWidth: screenWidth, screenHeight: screenHeight)
        let endPoint = devicePointToHost(CGPoint(x: x2, y: y2), screenRect: screenRect, screenWidth: screenWidth, screenHeight: screenHeight)
        let steps = 12
        postMouseEvent(type: .mouseMoved, point: startPoint)
        usleep(20_000)
        postMouseEvent(type: .leftMouseDown, point: startPoint)
        for step in 1...steps {
            let progress = Double(step) / Double(steps)
            let point = CGPoint(
                x: startPoint.x + (endPoint.x - startPoint.x) * progress,
                y: startPoint.y + (endPoint.y - startPoint.y) * progress
            )
            postMouseEvent(type: .leftMouseDragged, point: point)
            usleep(durationMicros / useconds_t(steps))
        }
        postMouseEvent(type: .leftMouseUp, point: endPoint)
    case let .key(name):
        switch name {
        case "POWER", "LOCK":
            postKeyboardShortcut(keyCode: 37, modifiers: .maskCommand) // Cmd-L
        case "HOME":
            postKeyboardShortcut(keyCode: 4, modifiers: [.maskCommand, .maskShift]) // Cmd-Shift-H
        case "VOLUME_UP":
            postKeyboardShortcut(keyCode: 126, modifiers: .maskCommand) // Cmd-Up
        case "VOLUME_DOWN":
            postKeyboardShortcut(keyCode: 125, modifiers: .maskCommand) // Cmd-Down
        default:
            fail("unsupported key action \(name)")
        }
    }
}

let config = parseArgs()
ensureAccessibilityPermissions()
activateSimulator()
let windowFrame = findWindowFrame(appName: config.appName, windowMatch: config.windowMatch)
let targetScreenRect = screenRect(in: windowFrame, screenWidth: config.screenWidth, screenHeight: config.screenHeight)
perform(config.action, screenRect: targetScreenRect, screenWidth: config.screenWidth, screenHeight: config.screenHeight)

Add-Type -AssemblyName System.Drawing

function New-RoundedRectanglePath {
    param(
        [System.Drawing.RectangleF]$Rectangle,
        [float]$Radius
    )
    $diameter = $Radius * 2
    $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $path.AddArc($Rectangle.X, $Rectangle.Y, $diameter, $diameter, 180, 90)
    $path.AddArc($Rectangle.Right - $diameter, $Rectangle.Y, $diameter, $diameter, 270, 90)
    $path.AddArc($Rectangle.Right - $diameter, $Rectangle.Bottom - $diameter, $diameter, $diameter, 0, 90)
    $path.AddArc($Rectangle.X, $Rectangle.Bottom - $diameter, $diameter, $diameter, 90, 90)
    $path.CloseFigure()
    return $path
}

function New-InterviewBarBitmap {
    param([int]$Size)

    $bitmap = [System.Drawing.Bitmap]::new($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.Clear([System.Drawing.Color]::Transparent)

    $scale = $Size / 256.0
    $background = New-RoundedRectanglePath ([System.Drawing.RectangleF]::new(8 * $scale, 8 * $scale, 240 * $scale, 240 * $scale)) (48 * $scale)
    $backgroundBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 31, 107, 75))
    $graphics.FillPath($backgroundBrush, $background)

    $page = New-RoundedRectanglePath ([System.Drawing.RectangleF]::new(50 * $scale, 55 * $scale, 156 * $scale, 151 * $scale)) (19 * $scale)
    $pageBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 248, 250, 249))
    $graphics.FillPath($pageBrush, $page)

    $headerBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 220, 239, 229))
    $graphics.FillRectangle($headerBrush, 50 * $scale, 76 * $scale, 156 * $scale, 34 * $scale)

    $ringPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(255, 248, 250, 249), 12 * $scale)
    $ringPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $ringPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $graphics.DrawLine($ringPen, 88 * $scale, 44 * $scale, 88 * $scale, 77 * $scale)
    $graphics.DrawLine($ringPen, 168 * $scale, 44 * $scale, 168 * $scale, 77 * $scale)

    $greenBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 40, 122, 89))
    $amberBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 214, 145, 22))
    $blueBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 67, 121, 190))
    $graphics.FillEllipse($greenBrush, 75 * $scale, 132 * $scale, 27 * $scale, 27 * $scale)
    $graphics.FillEllipse($amberBrush, 115 * $scale, 132 * $scale, 27 * $scale, 27 * $scale)
    $graphics.FillEllipse($blueBrush, 155 * $scale, 132 * $scale, 27 * $scale, 27 * $scale)

    $graphics.Dispose()
    $background.Dispose()
    $backgroundBrush.Dispose()
    $page.Dispose()
    $pageBrush.Dispose()
    $headerBrush.Dispose()
    $ringPen.Dispose()
    $greenBrush.Dispose()
    $amberBrush.Dispose()
    $blueBrush.Dispose()
    return $bitmap
}

$buildDirectory = Join-Path $PSScriptRoot '..\build'
New-Item -ItemType Directory -Path $buildDirectory -Force | Out-Null

$large = New-InterviewBarBitmap 256
$large.Save((Join-Path $buildDirectory 'icon.png'), [System.Drawing.Imaging.ImageFormat]::Png)

$icon = [System.Drawing.Icon]::FromHandle($large.GetHicon())
$stream = [System.IO.File]::Open((Join-Path $buildDirectory 'icon.ico'), [System.IO.FileMode]::Create)
$icon.Save($stream)
$stream.Dispose()
$icon.Dispose()
$large.Dispose()

$tray = New-InterviewBarBitmap 32
$tray.Save((Join-Path $buildDirectory 'tray.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$tray.Dispose()

Write-Output "Generated build/icon.png, build/icon.ico, and build/tray.png"

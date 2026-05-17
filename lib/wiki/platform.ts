import print from '../print';

export function requireMacOS(): void {
  if (process.platform !== 'darwin') {
    print.error(`rig wiki currently supports macOS only (detected: ${process.platform}). Linux support is on the P5 roadmap; Windows is not planned.`);
    process.exit(32);
  }
}

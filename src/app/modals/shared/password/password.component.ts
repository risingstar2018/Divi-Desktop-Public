import { Component, EventEmitter, HostListener, Input, OnDestroy, Output } from '@angular/core';
import { Log } from 'ng2-logger';

import { IPassword } from './password.interface';
import { MatDialogRef } from '@angular/material';

import { RpcService, RpcStateService, SecurityService } from '../../../core';
import { SnackbarService } from '../../../core/snackbar/snackbar.service';
import { ModalsComponent } from '../../modals.component';
import { Observable } from 'rxjs/Observable';

@Component({
  selector: 'app-password',
  templateUrl: './password.component.html',
  styleUrls: ['./password.component.scss']
})
export class PasswordComponent implements OnDestroy {

  // UI State
  password: string;
  private destroyed: boolean = false;

  @Input() showPass: boolean = false;
  @Input() label: string = 'Your Wallet password';
  @Input() buttonText: string;
  @Input() backButtonText: string;
  @Input() stakeOnly: boolean = false;
  @Input() showStakeOnly: boolean = true;
  @Input() isDisabled: boolean = false;
  @Input() isButtonDisable: boolean = false;
  @Input() showPassword: boolean = false;
  @Input() unlockTimeout: number = 300;
  @Input() alwaysUnlocked: boolean = false;
  @Input() isBackButtonDisabled: boolean = false;

  /**
    * The password emitter will send over an object with the password and stakingOnly info.
    * This is useful as a building block in the initial setup, where we want to have the actual value of the password.
    */
  @Input() emitPassword: boolean = false;
  @Output() passwordEmitter: EventEmitter<IPassword> = new EventEmitter<IPassword>();
  @Output() backEmitter: EventEmitter<void> = new EventEmitter<void>();
  @Output() showPasswordToggle: EventEmitter<boolean> = new EventEmitter<boolean>();
  /**
    * The unlock emitter will automatically unlock the wallet for a given time and emit the JSON result
    * of 'getwalletinfo'. This can be used to automatically request an unlock and instantly do a certain things:
    * send a transaction, before it locks again.
    */
  @Input() emitUnlock: boolean = false;
  @Output() unlockEmitter: EventEmitter<string> = new EventEmitter<string>();

  log: any = Log.create('password.component');

  public timeouts: any[] = [
    { value: 60, title: "1 minute" },
    { value: 120, title: "2 minutes" },
    { value: 180, title: "3 minutes" },
    { value: 300, title: "5 minutes" }, 
    { value: 600, title: "10 minutes" },
    { value: 1200, title: "20 minutes" },
    { value: 1800, title: "30 minutes" },
    { value: 0, title: "Always" }
  ];

  constructor(private _rpc: RpcService,
              private _rpcState: RpcStateService,
              private flashNotification: SnackbarService,
              private securityService: SecurityService,
              public dialogRef: MatDialogRef<ModalsComponent>) {
  }

  ngOnInit() {
    if (this.alwaysUnlocked) {
      this.timeouts = [{ value: 0, title: "Always" }];
      this.unlockTimeout = 0;
    }
  }

  ngOnDestroy() {
    this.destroyed = true;
  }

  /** Get the input type - password or text */
  getInputType(): string {
    return (this.showPass ? 'text' : 'password');
  }

  // -- RPC logic starts here --

  unlock (): void {
    this.forceEmit();
  }

  back(): void {
    this.backEmitter.emit();
  }

  public async forceEmit(): Promise<void> {
    if (this.emitPassword) {
      // emit password
      this.sendPassword();
    }

    if (this.emitUnlock) {
      // emit unlock
      try {
        await this.internalUnlock();
      } catch (e) {
        this.log.er('rpc_unlock_failed: unlock failed - wrong password?', e);
        this.flashNotification.open('Unlock failed - password was incorrect', 'err');
      }
    }
  }

  clear(): void {
    this.password = undefined;
  }

  /**
  * Emit password only!
  */
  sendPassword(): void {
    const pass: IPassword = {
      password: this.password,
      stakeOnly: this.stakeOnly
    };
    this.passwordEmitter.emit(pass);
  }

  /** Unlock the wallet
    * TODO: This should be moved to a service...
    */
  private async internalUnlock(): Promise<void> {
    await this.securityService.lock();
    this.checkAndFallbackToStaking();
    await this.securityService.unlock(
      this.password,
      +(this.stakeOnly ? 0 : this.unlockTimeout),
      this.stakeOnly
    );

    let _subs = this._rpcState.observe('getwalletinfo', 'encryptionstatus')
    .takeWhile(() => !this.destroyed)
    .skip(1)
    .subscribe(
      encryptionstatus => {
        // hook for unlockEmitter, warn parent component that wallet is unlocked!
        this.unlockEmitter.emit(encryptionstatus);
        if (_subs) {
          _subs.unsubscribe();
          _subs = null;
        }
      });
  }

  /**
    * If we're unlocking the wallet for a period of this.unlockTimeout, then check if it was staking
    * if(staking === true) then fallback to staking instead of locked after timeout!
    * else lock wallet
    */
  private checkAndFallbackToStaking(): void {
    if (this._rpcState.get('getwalletinfo').encryptionstatus === 'Unlocked, staking only') {

      const password = this.password;
      const timeout = this.unlockTimeout;

      // After unlockTimeout, unlock wallet for staking again.
      setTimeout((() => {
          this._rpc.call('encryptwallet', [password, 0, true]).subscribe();
          this.reset();
        }).bind(this), (timeout + 1) * 1000);

    } else {
      // reset after 500ms so rpc_unlock has enough time to use it!
      setTimeout(this.reset,  500);
    }
  }

  private reset(): void {
    this.password = '';
  }

  // emit showpassword change
  toggle(): void {
    this.showPasswordToggle.emit(this.showPass);
  }

  // capture the enter button
  @HostListener('window:keydown', ['$event'])
    keyDownEvent(event: any) {
      if (event.keyCode === 13) {
        this.unlock();
      }
    }
}
